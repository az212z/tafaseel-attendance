"""Start the isolated local preview and its PHP API."""
from pathlib import Path
import os, socket, subprocess, sys

root=Path(__file__).resolve().parents[1]
target=Path('/tmp/tafaseel-attendance-preview')
for port in [3080,3081]:
    with socket.socket() as probe:
        try: probe.bind(('127.0.0.1',port))
        except OSError: sys.exit(f'Port {port} is already in use. The preview may already be running.')
subprocess.run(['python3',str(root/'scripts/prepare_preview.py')],cwd=root,check=True)
env=os.environ.copy()
env['ATTENDANCE_CONFIG_PATH']=str(target/'attendance-config.php')
env['ATTENDANCE_PRIVATE_DIR']=str(root/'server')
backend=subprocess.Popen(['php','-S','127.0.0.1:3081','-t','public','scripts/router.php'],cwd=root,env=env)
frontend=subprocess.Popen(['npm','run','dev'],cwd=root)
try:
    frontend.wait()
except KeyboardInterrupt:
    pass
finally:
    for process in [frontend,backend]:
        if process.poll() is None: process.terminate()
    for process in [frontend,backend]:
        try: process.wait(timeout=5)
        except subprocess.TimeoutExpired: process.kill()
