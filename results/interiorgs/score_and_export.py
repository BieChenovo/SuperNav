"""Offline InteriorGS scoring/replay export; no model calls or simulator stepping.

The released 0.1 m scorer and annotations remain untouched. A separate scorer
implements the paper's 1 m criterion and is checked against all released scores
at 0.1 m before exporting. Only public tool exchanges and agent RGB are exported.
"""
from collections import Counter
from datetime import datetime, timezone
from functools import lru_cache
import argparse
import csv
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import re
import shutil


METHODS = ['original_geo', 'original_learned', 'v2_geo', 'v2_learned']
LABELS = dict(zip(METHODS, ['原版 Geo', '原版 Learned', 'v2 Geo', 'v2 Learned']))
PAPER = {'geo': {'objectnav': {'sr': .78, 'spl': .4127}, 'multi-objectnav': {'sr': .34, 'spl': .1388}},
         'learned': {'objectnav': {'sr': .68, 'spl': .2059}, 'multi-objectnav': {'sr': .34, 'spl': .0862}}}
PAPER_URL = 'https://arxiv.org/html/2610.12126v1'


def read(path):
    return json.loads(path.read_text())


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(',', ':')) + '\n')


def js(value):
    return json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(',', ':')).replace('</', '<\\/')


def clean(value):
    """Remove host paths and operational IDs from otherwise allowlisted content."""
    if isinstance(value, dict):
        return {k: clean(v) for k, v in value.items() if k not in {'session_id', 'confirm_token'}}
    if isinstance(value, list):
        return [clean(v) for v in value]
    if isinstance(value, str):
        return re.sub(r'/(?:hpc2hdd|hpc2ssd|tmp|home)/[^\s\"<>]+', '[server path]', value)
    return value


def evaluate(episode, submission, nearest, threshold):
    """Paper B.2: saved positions, strict < threshold, ordered arrivals, explicit STOP."""
    goals = [[v['pose']['position'] for v in t['viewpoints']] for t in episode['targets']]
    events = submission['events']
    previous = events[0]['position']
    assert events[0]['action'] == 'start' and math.dist(previous, episode['start']['position']) < 1e-4
    active, length, success, status, arrivals = 0, 0., False, 'missing_stop', []
    curve = []
    for index, event in enumerate(events):
        action = event['action']
        if action in {'runtime_error', 'budget_exhausted'}:
            status = action
            break
        current = event['position']
        delta = math.dist(previous, current)
        assert action != 'stop' or delta <= 1e-4
        length += delta
        previous = current
        target_before = min(active, len(goals)-1) if episode['ordered'] else 0
        distance = nearest(current, goals[target_before])
        curve.append({'target': target_before, 'distance': distance if math.isfinite(distance) else None})
        if episode['ordered']:
            while active < len(goals):
                d = nearest(current, goals[active])
                if not (math.isfinite(d) and 0 <= d < threshold):
                    break
                arrivals.append(index)
                active += 1
        if action == 'stop':
            status = 'stopped'
            if episode['ordered']:
                success = active == len(goals)
            else:
                success = math.isfinite(distance) and 0 <= distance < threshold
                active = int(success)
                if success:
                    arrivals = [index]
            break
    reference = episode['ground_truth']['variants']['global_shortest']['total_geodesic_distance']
    spl = (reference / max(reference, length) if max(reference, length) else 1.) if success else 0.
    if status == 'runtime_error':
        success, spl = None, None
    return {'episode_id': episode['episode_id'], 'status': status, 'success': success, 'spl': spl,
            'visited_targets': active, 'target_count': len(goals), 'path_length_m': length,
            'reference_variant': 'global_shortest', 'reference_length_m': reference,
            'threshold_m': threshold, 'arrivals': arrivals, 'curve': curve}


def verify_rules():
    def ep(goals, ordered=False):
        return {'episode_id': 'test', 'start': {'position': [0,0,0]}, 'ordered': ordered,
                'targets': [{'viewpoints': [{'pose': {'position': p}}]} for p in goals],
                'ground_truth': {'variants': {'global_shortest': {'total_geodesic_distance': 1.}}}}
    def sub(*events):
        return {'events': [{'action': a, 'position': p} for a,p in events]}
    near = lambda p, gs: min(math.dist(p,g) for g in gs)
    start = ('start', [0,0,0]); stop = ('stop', [0,0,0])
    assert not evaluate(ep([[1,0,0]]), sub(start,stop),near,1)['success']
    assert evaluate(ep([[.999,0,0]]),sub(start,stop),near,1)['success']
    assert not evaluate(ep([[0,0,0]]),sub(start),near,1)['success']
    overlap = evaluate(ep([[0,0,0],[.5,0,0]],True),sub(start,stop),near,1)
    assert overlap['success'] and overlap['arrivals'] == [0,0]
    wrong_order = sub(start,('move_forward',[2,0,0]),('stop',[2,0,0]))
    assert not evaluate(ep([[2,0,0],[0,0,0]],True),wrong_order,near,.1)['success']
    # Crossing a goal between recorded positions does not count as an arrival.
    assert not evaluate(ep([[1,0,0]],True),wrong_order,near,.1)['success']
    passed_then_left = sub(start,('move_forward',[2,0,0]),('stop',[2,0,0]))
    assert not evaluate(ep([[0,0,0]]),passed_then_left,near,.1)['success']
    return ['strict threshold boundary', 'explicit STOP', 'overlapping ordered goals at start',
            'target order', 'no interpolated arrivals', 'single-object final position']


def main(args):
    import habitat_sim
    import numpy as np
    from PIL import Image
    checks = verify_rules()
    archive, out, repo = args.archive.resolve(), args.output.resolve(), args.repository.resolve()
    public = args.dataset.resolve()
    manifest, results = read(archive/'manifest.json'), read(archive/'results.json')['episodes']
    assert len(results) == len({r['case_id'] for r in results})
    episode_by_id = {}
    for task in ['objectnav', 'multi-objectnav']:
        for e in read(public/task/'v1/episodes.json')['episodes']:
            episode_by_id[(task,e['episode_id'])] = e
    spec = importlib.util.spec_from_file_location('released_score', public/'evaluation/score.py')
    official = importlib.util.module_from_spec(spec); spec.loader.exec_module(official)
    target = repo/'review/interiorgs'
    for name in ['cases','maps','media']:
        (target/name).mkdir(parents=True, exist_ok=True)
    out.mkdir(parents=True, exist_ok=True)
    source_runtime = Path(manifest['runtime'])
    media, maps, public_rows, local_rows, planned_files = {}, {}, [], [], []
    pf = habitat_sim.PathFinder()
    current_scene = None
    cache = {}

    def nearest(start, goals):
        key = (tuple(start), tuple(tuple(g) for g in goals))
        if key not in cache:
            q = habitat_sim.MultiGoalShortestPath()
            q.requested_start, q.requested_ends = start, goals
            cache[key] = float(q.geodesic_distance) if pf.find_path(q) else math.inf
        return cache[key]

    def locate(path):
        p = Path(path)
        if p.is_relative_to(source_runtime) and p.is_file():
            return p
        if p.is_relative_to(source_runtime):
            archived = archive/p.relative_to(source_runtime)
            if archived.is_file():
                return archived
        if p.is_file():
            return p
        raise FileNotFoundError(p)

    def frame(image):
        p = locate(image['path'])
        assert p.suffix.lower() in {'.png','.jpg','.jpeg'}
        # Only downsampled images that the tool actually returned to the agent.
        assert image.get('width') <= 256 and image.get('height') <= 256
        identifier = hashlib.sha256(p.read_bytes()).hexdigest()
        relative = 'media/'+identifier+p.suffix.lower()
        if relative not in media:
            dst = target/relative
            if not dst.exists():
                shutil.copyfile(p,dst)
            assert hashlib.sha256(dst.read_bytes()).hexdigest() == identifier
            media[relative] = {'sha256': identifier, 'bytes': dst.stat().st_size}
        return {'url': relative, 'view': image.get('view') or image.get('direction'),
                'ref': image.get('image_ref'), 'width': image['width'], 'height': image['height']}

    sorted_results = sorted(results,key=lambda r:(episode_by_id[r['task'],r['task_id']]['scene']['id'],r['case_id']))
    for ordinal, result in enumerate(sorted_results):
        episode = episode_by_id[result['task'],result['task_id']]
        scene = episode['scene']['id']
        if scene != current_scene:
            mesh = (args.scenes/episode['scene']['asset']).with_suffix('').with_suffix('.navmesh')
            assert pf.load_nav_mesh(str(mesh)), mesh
            current_scene, cache = scene, {}
        case_root = archive/'cases'/result['case_id']
        attempts = sorted(case_root.glob('attempt_*'), key=lambda p:int(p.name.split('_')[-1]))
        attempt = next(p for p in reversed(attempts) if (p/'submissions.json').exists())
        submission = next(s for s in read(attempt/'submissions.json')['episodes'] if s['episode_id']==result['task_id'])
        strict_official = official.score_episode(episode,submission,nearest,pf.is_navigable)
        for k,v in result['score'].items():
            assert strict_official[k] == v or (isinstance(v,float) and math.isclose(strict_official[k],v,abs_tol=1e-8)), (result['case_id'],k)
        scores = {str(t): evaluate(episode,submission,nearest,t) for t in [.1,1.]}
        for k,v in strict_official.items():
            assert scores['0.1'][k] == v or (isinstance(v,float) and math.isclose(scores['0.1'][k],v,abs_tol=1e-8)), (result['case_id'],k)
        assert not scores['0.1']['success'] or scores['1.0']['success']
        run = attempt/'runs/trial'
        metric, execution = read(run/'metrics.json'), read(run/'execution.resolved.json')
        assert metric['session_closed']
        trajectories = list((attempt/'visuals').glob('*.trajectory.json'))
        assert len(trajectories)==1
        trajectory = read(trajectories[0])
        sparse = {e.get('tool_seq'):e for e in trajectory['events']}
        dense = trajectory['dense_trajectory']['points']
        primitive = submission['events']
        # Match tool boundary positions to actual submitted primitive positions.
        cursor, events, images, call, intro = 0, [], [], {}, []
        for line in (run/'canonical.jsonl').open():
            e=json.loads(line)
            if e.get('type')=='assistant_text':
                (events[-1]['text'] if events else intro).append(clean(e.get('text','')))
            elif e.get('type')=='tool_call':
                call = e
            elif e.get('type')=='tool_result':
                a=e.get('audit') or {}
                pose=sparse.get(e.get('audit_tool_seq')) or {}
                state=a.get('state_summary') or {}
                pos=state.get('position') or (pose.get('pose')or{}).get('position')
                if e['name']=='hab_init_scene':pos=primitive[0]['position']
                if e['name']=='hab_close_session':pos=primitive[-1]['position'];cursor=len(primitive)-1
                elif pos is not None:
                    matches=[i for i in range(cursor,len(primitive)) if math.dist(pos,primitive[i]['position'])<.003]
                    if matches:cursor=matches[0]
                fresh=a.get('panorama_images') or (a.get('scene_info')or{}).get('panorama_images') or []
                before=images
                if fresh:images=[frame(im) for im in fresh]
                args_in=call.get('input',{}) if call.get('name')==e['name'] else {}
                events.append({'name':e['name'],'input':clean(args_in),'position':pos,
                               'heading':state.get('heading_deg',(pose.get('pose')or{}).get('heading_deg')),
                               'primitive_index':cursor,'images':images,'input_images':before,
                               'fresh_images':bool(fresh),'status':a.get('nav_status') or a.get('status') or ('error' if a.get('error') else 'returned'),
                               'error':clean(a.get('error')),'steps':a.get('steps_executed',a.get('steps')),
                               'collided':state.get('collided'),'text':[]})
        key=result['method']+'__'+result['task_id']
        summary={k:result[k] for k in ['case_id','method','version','executor','task','task_id','elapsed_s']}
        summary.update(key=key,scene=scene,instruction=episode['instruction'],target_count=len(episode['targets']),
                       scores={t:{k:v for k,v in s.items() if k!='curve'} for t,s in scores.items()},
                       claim=metric.get('agent_terminal_claim'),steps=metric.get('nav_steps_total'),events=len(events))
        skill_docs=[]
        for name in execution['arm_config'].get('skill_names',[]):
            roots=list((run/'skill_snapshot').glob('**/'+name+'/SKILL.md'))
            if not roots:continue
            for p in [roots[0]]+sorted((roots[0].parent/'references').glob('*.md')):
                skill_docs.append({'name':name+'/'+str(p.relative_to(roots[0].parent)), 'text':clean(p.read_text())})
        case={'summary':summary,'events':events,'intro':intro,'primitive_events':primitive,'scores':scores,
              'targets':[{'description':t['description'],'views':[v['pose']['position'] for v in t['viewpoints']]} for t in episode['targets']],
              'prompt':clean((run/'prompt.txt').read_text()),'skills':skill_docs,
              'parameters':{'model':execution['model'],'reasoning_effort':'high','is_gaussian':True,
                            'agent_image_size':[256,192],'sensor_height':metric.get('sensor_height'),
                            'tool_whitelist':execution['arm_config'].get('tool_whitelist'),
                            'environment':execution['arm_config'].get('environment',{}),
                            'learned_effective':{'done_threshold':.1 if result['version']=='v2' else .5,'execute_actions':3} if result['executor']=='learned' else None}}
        (target/f'cases/{key}.js').write_text('window.INTERIOR_CASES['+js(key)+']='+js(case)+';\n')
        public_rows.append(summary)
        local_rows.append({'case_id':result['case_id'],'attempt':str(attempt),'submission_sha256':hashlib.sha256((attempt/'submissions.json').read_bytes()).hexdigest()})
        if scene not in maps:
            lower,upper=pf.get_bounds();levels=[]
            for y,count in Counter(round(e['position'][1],1) for e in primitive).most_common():
                if all(abs(y-h)>.85 for h in levels):levels.append(y)
                if len(levels)==5:break
            entries=[]
            for n,y in enumerate(sorted(levels)):
                raster=pf.get_topdown_view(.08,float(y));rgb=np.full((*raster.shape,3),248,dtype=np.uint8);rgb[raster.astype(bool)]=[215,226,234]
                relative=f'maps/{scene}_{n}.png';Image.fromarray(rgb).save(target/relative)
                entries.append({'height':y,'url':relative,'lower':[float(lower[0]),float(lower[2])], 'mpp':.08,
                                'width':int(raster.shape[1]),'height_px':int(raster.shape[0])})
            maps[scene]=entries
        if ordinal%10==0:
            write(out/'progress.json',{'status':'building','completed':ordinal+1,'total':len(results),'images':len(media)})
            print('built',ordinal+1,'/',len(results),flush=True)
    common={task:sorted(set.intersection(*[{r['task_id'] for r in public_rows if r['task']==task and r['method']==m} for m in METHODS])) for task in ['objectnav','multi-objectnav']}
    aggregates=[]
    for cohort in ['all_completed','matched']:
        for task in common:
            for method in METHODS:
                group=[r for r in public_rows if r['task']==task and r['method']==method and (cohort=='all_completed' or r['task_id'] in common[task])]
                for threshold in ['0.1','1.0']:
                    successes=sum(bool(r['scores'][threshold]['success']) for r in group)
                    aggregates.append({'cohort':cohort,'task':task,'method':method,'threshold_m':float(threshold),
                                       'n':len(group),'successes':successes,'sr':successes/len(group),
                                       'spl':sum(r['scores'][threshold]['spl'] for r in group)/len(group)})
    index={'generated_at':datetime.now(timezone.utc).isoformat(),'status':'incomplete','expected':400,'completed':len(results),
           'remaining':400-len(results),'cases':public_rows,'common':common,'aggregates':aggregates,'paper':PAPER,
           'paper_url':PAPER_URL,'maps':maps,'labels':LABELS,
           'stop_reason':'OpenAI transport unavailable; workers stopped between episodes',
           'notes':['部分完成结果，不能当作完整的 50+50 评测。','1 米是对已保存轨迹的离线重评分；不改变运行，也不是重新执行。',
                    '论文每类 150 条；本轮计划每类相同 50 条，目前完成数不同。默认比较四方法共有的 episode。',
                    '原版与 v2 的区别沿用本轮冻结快照；地图、批准观察点和评分曲线只供评测后检查，不是 Agent 输入。',
                    '单目标检查最终 STOP 位置；多目标检查保存轨迹中的顺序到达及最终 STOP。目标区域可重叠，不插值。']}
    (target/'data.js').write_text('window.INTERIOR_DATA='+js(index)+';window.INTERIOR_CASES={};\n')
    write(out/'comparison.json',index)
    report=repo/'results/interiorgs';report.mkdir(parents=True,exist_ok=True)
    write(report/'comparison.json',index)
    fields=['method','task','task_id','scene','threshold_m','success','spl','visited_targets','target_count','path_length_m','reference_length_m','status']
    with (report/'episodes.csv').open('w',encoding='utf-8-sig',newline='') as f:
        w=csv.DictWriter(f,fieldnames=fields);w.writeheader()
        for r in public_rows:
            for t,s in r['scores'].items():w.writerow({k:r.get(k,s.get(k)) for k in fields})
    for name in ['interiorgs.html','interiorgs.js','interiorgs.css']:
        shutil.copyfile(Path(__file__).with_name(name),target/({'interiorgs.html':'index.html','interiorgs.js':'app.js','interiorgs.css':'style.css'}[name]))
    (target/'fonts').mkdir(exist_ok=True)
    shutil.copyfile(Path(__file__).parent/'fonts/interiorgs.ttf',target/'fonts/review.ttf')
    shutil.copyfile(Path(__file__).parent/'fonts/OFL.txt',target/'fonts/OFL.txt')
    shutil.copyfile(Path(__file__),report/'score_and_export.py')
    audit={'status':'passed','cases':len(results),'released_0_1m_scores_matched':len(results),'rule_checks':checks,
           'source_scorer_sha256':hashlib.sha256((public/'evaluation/score.py').read_bytes()).hexdigest(),
           'dataset_revision':manifest['dataset_revision'],'source_revision':manifest['source_revision'],
           'selection_seed':manifest['selection_seed'],'raw_or_hidden_reasoning_exported':False,
           'images':len(media),'image_bytes':sum(r['bytes'] for r in media.values()),'scenes':len(maps)}
    write(report/'verification.json',audit);write(out/'verification.json',audit)
    write(out/'source_files.json',local_rows);write(out/'media_manifest.json',media)
    write(out/'progress.json',{'status':'complete','completed':len(results),'images':len(media)})
    print(json.dumps(audit,ensure_ascii=False),flush=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    for name in ['archive','output','repository','dataset','scenes']:parser.add_argument('--'+name,type=Path,required=True)
    main(parser.parse_args())
