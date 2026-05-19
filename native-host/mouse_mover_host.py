#!/usr/bin/env python3
"""Chrome native messaging host — moves the real system mouse cursor (Linux)."""

import json
import math
import random
import shutil
import struct
import subprocess
import sys
import time


def read_message():
    raw_length = sys.stdin.buffer.read(4)
    if not raw_length:
        sys.exit(0)
    message_length = struct.unpack("=I", raw_length)[0]
    message = sys.stdin.buffer.read(message_length).decode("utf-8")
    return json.loads(message)


def send_message(message):
    encoded = json.dumps(message).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("=I", len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()


def find_mover():
    if shutil.which("xdotool"):
        return "xdotool"
    if shutil.which("ydotool"):
        return "ydotool"
    return None


MOVER = find_mover()


def get_mouse_position():
    if MOVER != "xdotool":
        return None
    try:
        result = subprocess.run(
            ["xdotool", "getmouselocation", "--shell"],
            capture_output=True,
            text=True,
            check=False,
        )
        x = y = None
        for line in result.stdout.splitlines():
            if line.startswith("X="):
                x = int(line[2:])
            elif line.startswith("Y="):
                y = int(line[2:])
        if x is not None and y is not None:
            return float(x), float(y)
    except (ValueError, OSError):
        pass
    return None


def move_to(tool, x, y):
    xi, yi = int(round(x)), int(round(y))
    if tool == "xdotool":
        subprocess.run(
            ["xdotool", "mousemove", "--", str(xi), str(yi)],
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    elif tool == "ydotool":
        subprocess.run(
            ["ydotool", "mousemove", str(xi), str(yi)],
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )


def ease_in_out_quint(t):
    """Smooth acceleration and deceleration (0 <= t <= 1)."""
    if t <= 0:
        return 0.0
    if t >= 1:
        return 1.0
    return t * t * t * (t * (t * 6 - 15) + 10)


def cubic_bezier(t, p0, p1, p2, p3):
    u = 1.0 - t
    return (
        u * u * u * p0[0]
        + 3 * u * u * t * p1[0]
        + 3 * u * t * t * p2[0]
        + t * t * t * p3[0],
        u * u * u * p0[1]
        + 3 * u * u * t * p1[1]
        + 3 * u * t * t * p2[1]
        + t * t * t * p3[1],
    )


def make_control_points(from_x, from_y, to_x, to_y):
    dx = to_x - from_x
    dy = to_y - from_y
    dist = math.hypot(dx, dy) or 1.0

    perp_x = -dy / dist
    perp_y = dx / dist
    curve = dist * random.uniform(0.12, 0.38) * random.choice([-1, 1])

    p0 = (from_x, from_y)
    p3 = (to_x, to_y)
    p1 = (
        from_x + dx * random.uniform(0.2, 0.35) + perp_x * curve * random.uniform(0.4, 1.0),
        from_y + dy * random.uniform(0.2, 0.35) + perp_y * curve * random.uniform(0.4, 1.0),
    )
    p2 = (
        from_x + dx * random.uniform(0.65, 0.8) + perp_x * curve * random.uniform(0.2, 0.7),
        from_y + dy * random.uniform(0.65, 0.8) + perp_y * curve * random.uniform(0.2, 0.7),
    )
    return p0, p1, p2, p3


def move_human_like(from_x, from_y, to_x, to_y):
    dist = math.hypot(to_x - from_x, to_y - from_y)

    if dist < 3:
        move_to(MOVER, to_x, to_y)
        return

    # Longer travel → more steps and slightly longer duration
    steps = int(dist / random.uniform(5.5, 8.5))
    steps = max(35, min(160, steps))
    duration = random.uniform(0.45, 0.75) + dist / random.uniform(1400, 2200)
    duration = min(duration, 2.8)

    p0, p1, p2, p3 = make_control_points(from_x, from_y, to_x, to_y)

    # Rare slight overshoot then settle (feels more natural)
    overshoot = random.random() < 0.18 and dist > 120
    if overshoot:
        overshoot_scale = random.uniform(1.02, 1.06)
        p3 = (
            to_x + (to_x - from_x) * (overshoot_scale - 1),
            to_y + (to_y - from_y) * (overshoot_scale - 1),
        )

    prev_x, prev_y = from_x, from_y
    for i in range(1, steps + 1):
        t_linear = i / steps
        t = ease_in_out_quint(t_linear)
        x, y = cubic_bezier(t, p0, p1, p2, p3)

        # Subtle hand tremor (stronger mid-move)
        shake = math.sin(t_linear * math.pi)
        x += random.gauss(0, 0.35 + 0.5 * shake)
        y += random.gauss(0, 0.35 + 0.5 * shake)

        move_to(MOVER, x, y)
        prev_x, prev_y = x, y

        # Slower at start/end, faster in the middle
        speed = 0.35 + 0.65 * math.sin(t_linear * math.pi)
        delay = (duration / steps) / max(0.25, speed)
        delay *= random.uniform(0.88, 1.12)
        time.sleep(delay)

    if overshoot:
        settle_steps = random.randint(6, 12)
        for j in range(1, settle_steps + 1):
            t = j / settle_steps
            t = ease_in_out_quint(t)
            x = p3[0] + (to_x - p3[0]) * t
            y = p3[1] + (to_y - p3[1]) * t
            move_to(MOVER, x, y)
            time.sleep(random.uniform(0.012, 0.022))
    else:
        move_to(MOVER, to_x, to_y)

    time.sleep(random.uniform(0.03, 0.09))


def main():
    while True:
        message = read_message()
        action = message.get("action")

        if action == "ping":
            if not MOVER:
                send_message(
                    {
                        "error": "Install xdotool (X11) or ydotool (Wayland): sudo apt install xdotool",
                    }
                )
            else:
                send_message({"ok": True, "tool": MOVER})
        elif action == "move":
            from_x = float(message.get("fromX", message.get("toX", 0)))
            from_y = float(message.get("fromY", message.get("toY", 0)))
            to_x = float(message.get("toX", 0))
            to_y = float(message.get("toY", 0))

            actual = get_mouse_position()
            if actual is not None:
                from_x, from_y = actual

            try:
                move_human_like(from_x, from_y, to_x, to_y)
                send_message({"ok": True})
            except Exception as exc:
                send_message({"error": str(exc)})
        else:
            send_message({"error": f"Unknown action: {action}"})


if __name__ == "__main__":
    main()
