from pathlib import Path
import subprocess,tempfile,os,time,datetime,shlex,json,atexit,shutil
root=Path(tempfile.mkdtemp(prefix='gdg-keepalive-audit-'))
atexit.register(shutil.rmtree, root)
git=subprocess.check_output(['which','git'],text=True).strip()
workflow=Path(__file__).resolve().parents[1]/'.github/workflows/testflight-keepalive.yml'
blocks=workflow.read_text().split('        run: |\n')[1:]
assert len(blocks)==2, 'Expected exactly two audited Bash scripts'
first,second=root/'inactivity.bash',root/'release.bash'
for target,block in zip([first,second],blocks):
 lines=[]
 for line in block.splitlines():
  if line and not line.startswith('          '):break
  lines.append(line[10:])
 target.write_text('\n'.join(lines)+'\n')
 subprocess.run(['bash','-n',str(target)],check=True)

baseenv={**os.environ,'GIT_CONFIG_NOSYSTEM':'1','GIT_CONFIG_GLOBAL':'/dev/null','GIT_TERMINAL_PROMPT':'0'}
def run(args,cwd,env=None,ok=True):
 r=subprocess.run(args,cwd=cwd,env={**baseenv,**(env or {})},text=True,capture_output=True,timeout=30)
 if ok and r.returncode:raise RuntimeError(r.stderr+r.stdout)
 return r
def g(path,*args):return run([git,*args],path).stdout.strip()
def fixture(name,seconds):
 p=root/name;p.mkdir();remote=p/'remote.git';seed=p/'seed';runner=p/'runner';out=p/'outputs'
 run([git,'init','--bare','--initial-branch=main',str(remote)],p)
 run([git,'init','--initial-branch=main',str(seed)],p)
 g(seed,'config','user.name','Fixture');g(seed,'config','user.email','fixture@example.test')
 (seed/'tracked.txt').write_text('fixture\n');(seed/'native/Scanner').mkdir(parents=True);(seed/'native/Scanner/fixture.swift').write_text('// fictional fixture\n');g(seed,'add','tracked.txt','native/Scanner/fixture.swift')
 stamp=datetime.datetime.fromtimestamp(time.time()-seconds,datetime.timezone.utc).isoformat()
 run([git,'commit','-m','Fictional baseline'],seed,{'GIT_AUTHOR_DATE':stamp,'GIT_COMMITTER_DATE':stamp})
 g(seed,'remote','add','origin',str(remote));g(seed,'push','origin','HEAD:main')
 run([git,'clone',str(remote),str(runner)],p)
 return p,remote,seed,runner,out,g(runner,'rev-parse','HEAD')
def check(p,runner,out):
 return run(['bash',str(first)],runner,{'GITHUB_OUTPUT':str(out)},ok=False)
def release(runner,head,env=None):
 return run(['bash',str(second)],runner,{'AUDITED_HEAD':head,**(env or {})},ok=False)
def advance(seed):
 with (seed/'tracked.txt').open('a') as f:f.write('Concurrent update\n')
 g(seed,'commit','-am','Concurrent update');g(seed,'push','origin','HEAD:main');return g(seed,'rev-parse','HEAD')
passed=[]
for name,seconds,expect in [('fresh',60,False),('below-threshold',55*86400-120,False),('threshold',55*86400+2,True),('future',-86400,None)]:
 p,remote,seed,runner,out,head=fixture(name,seconds);r=check(p,runner,out)
 if expect is None:assert r.returncode and g(remote,'rev-parse','main')==head
 else:
  assert r.returncode==0,r.stdout+r.stderr
  assert ('should_push='+str(expect).lower()) in out.read_text()
  if not expect:assert g(remote,'rev-parse','main')==head
  else:
   r=release(runner,head);assert r.returncode==0,r.stdout+r.stderr
   assert g(runner,'rev-parse','HEAD^')==head
   assert g(runner,'diff','HEAD^','HEAD')==''
   assert g(runner,'status','--porcelain')==''
   assert g(runner,'log','-1','--format=%s')=='chore(release): keep TestFlight build active'
   assert g(runner,'log','-1','--format=%an')=='github-actions[bot]'
   assert g(remote,'rev-list','--count','main')=='2'
   tag='testflight-keepalive-'+g(runner,'rev-parse','HEAD')
   assert g(remote,'rev-parse','refs/tags/'+tag)==g(runner,'rev-parse','HEAD')
   assert len(g(remote,'tag','--list').splitlines())==1
 passed.append(name)
for name in ['remote-advance','tracked-dirty','staged-dirty','untracked-dirty','commit-changes-tree','commit-dirties-checkout','prohibited-trailer','push-race']:
 p,remote,seed,runner,out,head=fixture(name,56*86400);assert check(p,runner,out).returncode==0
 expected=head;env={}
 if name=='remote-advance':expected=advance(seed)
 if name in ['tracked-dirty','staged-dirty']:
  (runner/'tracked.txt').write_text('unsaved\n')
  if name=='staged-dirty':g(runner,'add','tracked.txt')
 if name=='untracked-dirty':(runner/'unexpected').write_text('untracked')
 if name.startswith('commit-') or name=='prohibited-trailer':
  hook=runner/'.git/hooks'/('pre-commit' if name=='commit-changes-tree' else 'post-commit' if name=='commit-dirties-checkout' else 'prepare-commit-msg')
  body='printf changed >> tracked.txt\ngit add tracked.txt\n' if name=='commit-changes-tree' else 'printf dirty >> tracked.txt\n' if name=='commit-dirties-checkout' else 'printf "\\nCo-Authored-By: Fictional <fixture@example.test>\\n" >> "$1"\n'
  hook.write_text('#!/bin/sh\n'+body);hook.chmod(0o755)
 if name=='push-race':
  wrappers=p/'bin';wrappers.mkdir();wrapper=wrappers/'git'
  wrapper.write_text('#!/bin/sh\nif [ "${1:-}" = push ] && [ ! -e '+shlex.quote(str(p/'raced'))+' ]; then\n touch '+shlex.quote(str(p/'raced'))+'\n printf raced >> '+shlex.quote(str(seed/'tracked.txt'))+'\n '+shlex.quote(git)+' -C '+shlex.quote(str(seed))+' commit -am "Concurrent winning update" >/dev/null\n '+shlex.quote(git)+' -C '+shlex.quote(str(seed))+' push origin HEAD:main >/dev/null 2>&1\nfi\nexec '+shlex.quote(git)+' "$@"\n');wrapper.chmod(0o755)
  env={'PATH':str(wrappers)+':'+os.environ['PATH']}
 r=release(runner,head,env);assert r.returncode!=0,name+' unexpectedly released'
 if name=='push-race':expected=g(seed,'rev-parse','HEAD')
 assert g(remote,'rev-parse','main')==expected,name+' changed remote unexpectedly'
 assert not g(remote,'tag','--list'),name+' left a release tag despite failing'
 passed.append(name)
# A website commit cannot postpone the next native release.
p,remote,seed,runner,out,head=fixture('website-does-not-reset',56*86400)
advance(seed)
assert check(p,runner,out).returncode==0
assert 'should_push=true' in out.read_text()
passed.append('website-does-not-reset')
# A real native change does reset it.
p,remote,seed,runner,out,head=fixture('native-resets',56*86400)
(seed/'native/Scanner/fixture.swift').write_text('// native change\n')
g(seed,'commit','-am','Native change');g(seed,'push','origin','HEAD:main')
assert check(p,runner,out).returncode==0
assert 'should_push=false' in out.read_text()
passed.append('native-resets')
# The release's valid empty commit and tag reset it, even without file changes.
p,remote,seed,runner,out,head=fixture('release-resets',56*86400)
assert check(p,runner,out).returncode==0
assert release(runner,head).returncode==0
out.unlink()
assert check(p,runner,out).returncode==0
assert 'should_push=false' in out.read_text()
passed.append('release-resets')
# Do not trust a tag whose encoded hash and target disagree.
p,remote,seed,runner,out,head=fixture('invalid-release-tag',56*86400)
g(seed,'tag','testflight-keepalive-'+'0'*40)
g(seed,'push','origin','--tags')
assert check(p,runner,out).returncode!=0
assert g(remote,'rev-parse','main')==head
passed.append('invalid-release-tag')
# A competing tag creation must reject the main push too (atomic, no force).
p,remote,seed,runner,out,head=fixture('tag-race',56*86400)
assert check(p,runner,out).returncode==0
wrappers=p/'bin';wrappers.mkdir();wrapper=wrappers/'git'
wrapper.write_text('#!/bin/sh\nif [ "${1:-}" = push ]; then\n for arg do\n case "$arg" in refs/tags/testflight-keepalive-*:refs/tags/*)\n ref="${arg#*:}"\n '+shlex.quote(git)+' --git-dir='+shlex.quote(str(remote))+' update-ref "$ref" '+shlex.quote(head)+'\n ;;\n esac\n done\nfi\nexec '+shlex.quote(git)+' "$@"\n')
wrapper.chmod(0o755)
r=release(runner,head,{'PATH':str(wrappers)+':'+os.environ['PATH']})
assert r.returncode!=0
assert g(remote,'rev-parse','main')==head
passed.append('tag-race')
print(json.dumps({'passed':passed,'count':len(passed),'networkPushes':False}))
