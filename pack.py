"""Package Gridrich for distribution: user zip and developer source zip."""
import os, shutil, subprocess, zipfile, re
root = os.path.dirname(os.path.abspath(__file__))
ver = re.search(r"APP_VERSION\s*=\s*'([^']+)'", open(os.path.join(root,'app_template.html')).read()).group(1)
subprocess.check_call(['python3', os.path.join(root,'build.py')])
dist = os.path.join(root,'dist'); os.makedirs(dist, exist_ok=True)
user = os.path.join(dist, f'Gridrich_{ver}')
shutil.rmtree(user, ignore_errors=True); os.makedirs(os.path.join(user,'examples'))
for f in ['Gridrich.html','Gridrich_README.txt','LICENSE','THIRD_PARTY_LICENSES.txt','CITATION.cff','CHANGELOG.md']:
    shutil.copy(os.path.join(root,f), user)
shutil.copy(os.path.join(root,'test/bgd_example_divisions.geojson'), os.path.join(user,'examples','Bangladesh.geojson'))
shutil.copy(os.path.join(root,'test/bgd_example_records.csv'), os.path.join(user,'examples','Aves.csv'))
def zipdir(src, out):
    if os.path.exists(out): os.remove(out)
    with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
        for d,_,fs in os.walk(src):
            for f in fs:
                p=os.path.join(d,f); z.write(p, os.path.relpath(p, os.path.dirname(src)))
zipdir(user, os.path.join(dist, f'Gridrich_{ver}.zip'))
src = os.path.join(dist,'source','gridrich-app')
shutil.rmtree(os.path.join(dist,'source'), ignore_errors=True); os.makedirs(src)
for f in ['app_template.html','build.py','pack.py','README.md','Gridrich_README.txt','LICENSE','THIRD_PARTY_LICENSES.txt','CITATION.cff','CHANGELOG.md','package.json']:
    shutil.copy(os.path.join(root,f), src)
shutil.copytree(os.path.join(root,'lib'), os.path.join(src,'lib'))
shutil.copytree(os.path.join(root,'test'), os.path.join(src,'test'), ignore=shutil.ignore_patterns('*.png','out_*','*.out','*.xlsx','*.svg','out.*','dump_*','rb_*','review_console_output.txt'))
shutil.copytree(os.path.join(root,'validation'), os.path.join(src,'validation'))
shutil.copytree(os.path.join(root,'docs'), os.path.join(src,'docs'))
shutil.copytree(os.path.join(root,'.github'), os.path.join(src,'.github'))
open(os.path.join(src,'BUILD.txt'),'w').write(f"""Gridrich {ver} - developer source
Copyright (c) 2026 Kakon Chakma. MIT License.

app_template.html  application source (HTML, CSS, JavaScript)
lib/               bundled libraries (see THIRD_PARTY_LICENSES.txt)
build.py           builds app.html (web hosting, uses lib/) and Gridrich.html (single file);
                   embeds the Bangladesh example and the Natural Earth basemap
pack.py            builds and packages the user zip and this source zip
test/              headless browser test suites (Node 18+, npm install) and fixtures
validation/        independent R/sf script, comparison script, reference tables, reports
docs/              user manual, methodology, validation notes

Build: python3 build.py    Tests: npm test    Full validation: bash validation/run_all.sh
Package: python3 pack.py   See README.md.
""")
zipdir(src, os.path.join(dist, f'Gridrich_{ver}_source.zip'))
print('packaged', ver)
