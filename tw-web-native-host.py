#!/usr/bin/env python3
"""Firefox native messaging host for tw-web.
Receives {cmd: 'start'|'stop'|'status'} and responds with {success, message}.
Install: copy tw-web-native-host.json to ~/.mozilla/native-messaging-hosts/
"""
import sys, json, struct, subprocess, os
from pathlib import Path

LAUNCH_SCRIPT = Path(__file__).parent / 'tw-web-launch.sh'
PID_FILE = Path('/tmp/tw-web.pid')

def read_message():
    raw = sys.stdin.buffer.read(4)
    if len(raw) < 4:
        return None
    length = struct.unpack('<I', raw)[0]
    return json.loads(sys.stdin.buffer.read(length))

def write_message(msg):
    data = json.dumps(msg).encode()
    sys.stdout.buffer.write(struct.pack('<I', len(data)) + data)
    sys.stdout.buffer.flush()

def is_running():
    import urllib.request
    try:
        urllib.request.urlopen('http://localhost:5000/api/health', timeout=2)
        return True
    except Exception:
        return False

def handle(msg):
    cmd = (msg or {}).get('cmd', '')

    if cmd == 'status':
        return {'success': True, 'running': is_running()}

    if cmd == 'start':
        if is_running():
            return {'success': True, 'message': 'Already running'}
        result = subprocess.run(
            [str(LAUNCH_SCRIPT)],
            capture_output=True, text=True, timeout=15
        )
        if result.returncode == 0 and is_running():
            return {'success': True, 'message': 'Started'}
        return {'success': False, 'message': result.stderr.strip() or 'Failed to start'}

    if cmd == 'stop':
        if PID_FILE.exists():
            try:
                pid = int(PID_FILE.read_text().strip())
                os.kill(pid, 15)  # SIGTERM
                PID_FILE.unlink(missing_ok=True)
                return {'success': True, 'message': 'Stopped'}
            except (ValueError, ProcessLookupError) as e:
                PID_FILE.unlink(missing_ok=True)
                return {'success': False, 'message': str(e)}
        result = subprocess.run(['pkill', '-f', 'python3 app.py'], capture_output=True)
        return {'success': result.returncode == 0, 'message': 'Stopped' if result.returncode == 0 else 'Not running'}

    return {'success': False, 'message': f'Unknown command: {cmd}'}

if __name__ == '__main__':
    msg = read_message()
    write_message(handle(msg))
