from pathlib import Path
import json,subprocess,os,shutil,time,urllib.request
base=Path('/opt/briofold')
if os.geteuid()!=0:raise SystemExit('Run this prepared script with sudo.')
envpath=base/'briofold.env';composepath=base/'compose.json'
backup=base/'secrets'/('before-growth-enable-'+time.strftime('%Y%m%dT%H%M%S',time.gmtime()))
backup.mkdir(mode=0o700)
for p in [envpath,composepath]:shutil.copyfile(p,backup/p.name);os.chmod(backup/p.name,0o600)
flags=['BRIOFOLD_GROWTH_CONSENT_ENABLED','BRIOFOLD_BROADCAST_DISPATCH_ENABLED']
values=dict(line.split('=',1) for line in envpath.read_text().splitlines() if '=' in line and not line.lstrip().startswith('#'))
for key in flags:values[key]='true'
envpath.write_text('\n'.join(k+'='+v for k,v in values.items())+'\n');os.chmod(envpath,0o600)
config=json.loads(composepath.read_text())
for key in flags:config['services']['api']['environment'][key]='${'+key+'}'
composepath.write_text(json.dumps(config,indent=2));os.chmod(composepath,0o600)
command=['docker','compose','--env-file',str(envpath),'-f',str(composepath)]
try:
 subprocess.run(command+['config','--quiet'],check=True,capture_output=True)
 subprocess.run(command+['up','-d','api'],check=True)
 for attempt in range(15):
  try:
   with urllib.request.urlopen('http://127.0.0.1:8080/readyz',timeout=5) as response:
    if response.status==200:break
  except Exception:time.sleep(2)
 else:raise RuntimeError('Backend readiness did not recover')
 print('Bookings/Broadcast backend flags enabled; readiness passed. Consent and recipient validation remain enforced. No campaign was submitted.')
except Exception:
 for p in [envpath,composepath]:shutil.copyfile(backup/p.name,p)
 subprocess.run(command+['up','-d','api'],check=False)
 raise SystemExit('Enablement failed; previous configuration restored. No secrets displayed.')
