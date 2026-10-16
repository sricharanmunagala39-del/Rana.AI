# Opens a private HTTPS link to the running WanGP studio when Gradio's share link is not available.
import os, re, subprocess, time
log = open('/kaggle/working/wangp.log').read()
g = [w for w in log.split() if 'gradio.live' in w]
if g:
    print('OPEN:', g[-1], '\nDeepy film agent:', g[-1].rstrip('/') + '/deepy/')
else:
    if not os.path.exists('/tmp/cloudflared'):
        subprocess.run(['wget', '-q', '-O', '/tmp/cloudflared', 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64'], check=True)
        os.chmod('/tmp/cloudflared', 0o755)
    cf = subprocess.Popen(['/tmp/cloudflared', 'tunnel', '--url', 'http://localhost:7860', '--no-autoupdate'],
                          stdout=open('/kaggle/working/cf.log', 'w'), stderr=subprocess.STDOUT)
    url = None
    for _ in range(30):
        time.sleep(2)
        m = re.findall(r'https://[a-z0-9-]+\.trycloudflare\.com', open('/kaggle/working/cf.log').read())
        if m: url = m[0]; break
    if url:
        print('OPEN:', url, '\nDeepy film agent:', url + '/deepy/')
    else:
        print(open('/kaggle/working/cf.log').read()[-2000:])
print('studio running:', subprocess.run(['bash', '-c', 'curl -s -o /dev/null -w "%{http_code}" http://localhost:7860/'], capture_output=True, text=True).stdout)
