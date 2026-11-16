"""Keep the Pages artifact static and free of PHP server source."""
from pathlib import Path
import shutil
root=Path(__file__).resolve().parents[1]
dist=root/'dist'
if (dist/'api').exists(): shutil.rmtree(dist/'api')
(dist/'.htaccess').unlink(missing_ok=True)
(dist/'.nojekyll').touch()
print('Static browser demo prepared for GitHub Pages; PHP and credentials excluded.')
