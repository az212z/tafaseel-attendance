"""Package public files and private attendance code. No databases or credentials."""
from pathlib import Path
import hashlib, json, subprocess, zipfile

root=Path(__file__).resolve().parents[1]
subprocess.run(['npm','run','build'],cwd=root,check=True)
out=root/'output';out.mkdir(exist_ok=True)
manifest={}
with zipfile.ZipFile(out/'tafaseel-attendance-deploy.zip','w',zipfile.ZIP_DEFLATED) as archive:
    for file in sorted((root/'dist').rglob('*')):
        if file.is_file():
            target='public_html/'+str(file.relative_to(root/'dist'))
            archive.write(file,target);manifest[target]=hashlib.sha256(file.read_bytes()).hexdigest()
    for file in sorted((root/'server').iterdir()):
        if file.is_file() and file.name!='config.php':
            target='attendance-private/'+file.name
            archive.write(file,target);manifest[target]=hashlib.sha256(file.read_bytes()).hexdigest()
    archive.write(root/'docs/DEPLOYMENT.md','DEPLOYMENT.md')
    archive.writestr('manifest.json',json.dumps(manifest,indent=2))
(out/'manifest.json').write_text(json.dumps(manifest,indent=2))
print(out/'tafaseel-attendance-deploy.zip')
