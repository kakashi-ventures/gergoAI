"""Probe in sola lettura del controller CS: `python -m gergo_sdk.probe --host $ELITE_HOST`.

Stampa versione, tipo, robotMode, safety, remote, stato del task (Dashboard), posa TCP e giunti (RTSI),
offset del TCP e parametri MDH (Primary). Non invia nessun comando di movimento: il DashboardClient è in read-only
e la Primary non invia script in modalità diversa da armed.
"""
from __future__ import annotations

import argparse
import json
import math

from gergo_sdk.dashboard import DashboardClient
from gergo_sdk.primary import PrimaryClient
from gergo_sdk.rtsi import RtsiReader


def probe(host: str, dashboard_port: int = 29999, primary_port: int = 30001, rtsi_port: int = 30004) -> dict:
    out: dict = {}
    d = DashboardClient(host, dashboard_port, "read-only")
    try:
        d.connect()
        for k, cmd in [("version", "version"), ("robot_type", "robot -t"), ("robot_mode", "robotMode"),
                       ("safety", "safety -s"), ("remote", "remoteControl -s"), ("task", "task"),
                       ("task_status", "task -s")]:
            try:
                out[k] = d.send(cmd)
            except Exception as e:
                out[k] = f"ERRORE {e}"
    finally:
        d.close()
    r = RtsiReader(host, rtsi_port)
    try:
        r.connect()
        s = r.wait_fresh()
        p = s["actual_TCP_pose"]
        out["tcp_pose_base_mm_rad"] = [round(p[0] * 1000, 2), round(p[1] * 1000, 2), round(p[2] * 1000, 2),
                                       *[round(v, 4) for v in p[3:]]]
        out["joints_deg"] = [round(math.degrees(v), 2) for v in s["actual_joint_positions"]]
        out["rtsi_robot_mode"], out["rtsi_safety_status"] = s.get("robot_mode"), s.get("safety_status")
    except Exception as e:
        out["rtsi"] = f"ERRORE {e}"
    finally:
        r.close()
    pr = PrimaryClient(host, primary_port, "read-only")
    try:
        pr.connect()
        c = pr.wait_for("cartesian")
        out["tcp_offset_mm"] = [round(v * 1000, 2) for v in c.tcp_offset[:3]]
        m = pr.wait_for("mdh")
        out["mdh"] = {"a": m.a, "d": m.d, "alpha": m.alpha}
    except Exception as e:
        out["primary"] = f"ERRORE {e}"
    finally:
        pr.close()
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", required=True)
    ap.add_argument("--dashboard-port", type=int, default=29999)
    ap.add_argument("--primary-port", type=int, default=30001)
    ap.add_argument("--rtsi-port", type=int, default=30004)
    a = ap.parse_args()
    print(json.dumps(probe(a.host, a.dashboard_port, a.primary_port, a.rtsi_port), indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
