"""Exercise MCP-to-bridge configuration with a real child process/controller loop.

The adapter and policy are deterministic CPU fakes; no simulator or model loads.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys
from types import SimpleNamespace
from unittest.mock import patch

import numpy as np
import pytest

from supernav.backends.habitat.config import build_mcp_spec
from supernav.methods.navigation.tools.navigation_localnav import LocalNavigateTool

ROOT = Path(__file__).resolve().parents[1]


class Navigation:
    def __init__(self):
        self.position = np.zeros(3)
        self.moves = []
        self.rgb = np.zeros((32, 32, 3), dtype=np.uint8)
        self.session = SimpleNamespace(
            latest_visual_capture_seq=1, mapless=True,
            last_visual_image_refs={"frame:1": {
                "capture_seq": 1, "direction": "front", "rgb": self.rgb,
            }},
        )

    def navigation_session(self, session_id):
        return self.session

    def sensor_observations(self, session):
        return {"color_sensor": self.rgb}

    def agent_position(self, session):
        return self.position

    def step_action(self, session_id, payload):
        assert payload["action"] == "move_forward"
        self.moves.append(payload)
        self.position[2] -= payload["distance"]
        return {"steps_taken": 1, "collided": False,
                "state_summary": {"position": self.position.tolist()}}


class Policy:
    context_mode = "fixed"

    def healthz(self):
        return {"ok": True}

    def act(self, *args):
        return {"done_probability": 0.3, "confidence": 1.0,
                "trajectories": [[[0.25, 0.0]] * 8], "scores": [1.0]}


def run_controller(payload):
    from supernav.methods.localnav.navigation import navigate_with_localnav
    return navigate_with_localnav(Navigation(), "binding-test", payload, policy_client=Policy())


class ChildBridge:
    def __init__(self, tmp_path):
        self.tmp_path = tmp_path
        self.requests = []
        self.stderr = ""

    def call(self, action, payload, timeout):
        assert action == "navigate_with_localnav"
        self.requests.append(payload)
        # Deliberately disagree with the selected MCP arm. Its request must win.
        env = dict(os.environ, PYTHONPATH=str(ROOT / "src"),
                   NAV_LOCALNAV_DONE_THRESHOLD="0.9", NAV_LOCALNAV_EXEC_ACTIONS="1",
                   NAV_LOCALNAV_SAVE_FRAMES="0", NAV_ARTIFACTS_DIR=str(self.tmp_path))
        command = [sys.executable, "-c",
                   "import json,runpy,sys; namespace=runpy.run_path(sys.argv[1]); "
                   "print(json.dumps(namespace['run_controller'](json.load(sys.stdin))))",
                   str(Path(__file__).resolve())]
        child = subprocess.run(command, input=json.dumps(payload), text=True, env=env,
                               capture_output=True, timeout=30, check=True)
        self.stderr = child.stderr
        return {"result": json.loads(child.stdout)}


@pytest.mark.parametrize(("threshold", "actions", "status", "steps"), [
    ("0.1", "3", "reached", 6),
    ("0.1", "2", "reached", 4),
    ("0.5", "3", "timeout", 12),
])
def test_selected_arm_controls_actual_child_bridge_loop(tmp_path, threshold, actions, status, steps):
    arm = {"tool_whitelist": ["hab_local_navigate"], "environment": {
        "NAV_LOCALNAV_DONE_THRESHOLD": threshold, "NAV_LOCALNAV_EXEC_ACTIONS": actions,
    }}
    spec = build_mcp_spec(workspace_root=ROOT, config={}, arm_cfg=arm)
    bridge = ChildBridge(tmp_path)
    with patch.dict(os.environ, spec.environment):
        result = LocalNavigateTool().execute(
            {"image_ref": "frame:1", "point": [0.5, 0.8], "max_steps": 12},
            SimpleNamespace(bridge=bridge),
        )
    assert result.ok
    assert result.body["status"] == status
    assert result.body["steps"] == steps
    assert bridge.requests[0]["done_threshold"] == float(threshold)
    assert bridge.requests[0]["execute_actions"] == int(actions)
    log = next(json.loads(line) for line in bridge.stderr.splitlines()
               if '"event": "localnav_control_parameters"' in line)
    assert log["done_threshold"] == float(threshold)
    assert log["execute_actions"] == int(actions)


def test_request_parameters_do_not_leak_to_next_hop(tmp_path, monkeypatch):
    monkeypatch.setenv("NAV_LOCALNAV_SAVE_FRAMES", "0")
    monkeypatch.setenv("NAV_ARTIFACTS_DIR", str(tmp_path))
    monkeypatch.setenv("NAV_LOCALNAV_DONE_THRESHOLD", "0.9")
    monkeypatch.setenv("NAV_LOCALNAV_EXEC_ACTIONS", "1")
    payload = {"image_ref": "frame:1", "point": [0.5, 0.8], "max_steps": 12}
    first = run_controller({**payload, "done_threshold": 0.1, "execute_actions": 2})
    second = run_controller(payload)
    assert (first["status"], first["steps"]) == ("reached", 4)
    assert (second["status"], second["steps"]) == ("timeout", 12)
    assert os.environ["NAV_LOCALNAV_DONE_THRESHOLD"] == "0.9"
    assert os.environ["NAV_LOCALNAV_EXEC_ACTIONS"] == "1"


@pytest.mark.parametrize(("name", "value"), [
    ("NAV_LOCALNAV_DONE_THRESHOLD", "nan"),
    ("NAV_LOCALNAV_DONE_THRESHOLD", "-0.1"),
    ("NAV_LOCALNAV_DONE_THRESHOLD", "1.1"),
    ("NAV_LOCALNAV_EXEC_ACTIONS", "0"),
    ("NAV_LOCALNAV_EXEC_ACTIONS", "2.5"),
])
def test_invalid_arm_parameters_rejected_before_dispatch(monkeypatch, name, value):
    monkeypatch.setenv(name, value)
    result = LocalNavigateTool().execute(
        {"image_ref": "frame:1", "point": [0.5, 0.8]},
        SimpleNamespace(bridge=SimpleNamespace(call=lambda *a, **k: pytest.fail("must not move"))),
    )
    assert not result.ok
    assert "invalid localnav configuration" in result.error
