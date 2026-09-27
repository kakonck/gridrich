# Rebuilds app.html (uses lib/ scripts) and Gridrich.html (single file) from app_template.html
import os
os.chdir(os.path.dirname(os.path.abspath(__file__)))
s = open('app_template.html').read()
esc = lambda t: t.replace('\\', '\\\\').replace('`', '\\`').replace('${', '\\${')
gj = open('test/bgd_example_divisions.geojson').read().strip()
import base64
csv = base64.b64encode(open('test/bgd_example_records.zip','rb').read()).decode()
ne = open('test/ne_countries_110m.geojson').read().strip()
page = s.replace('__EXAMPLE_BOUNDARY__', esc(gj)).replace('__EXAMPLE_RECORDS__', esc(csv)).replace('__NE_COUNTRIES__', esc(ne))
open('app.html', 'w').write(page)
st = page
for lib in ['proj4.js', 'turf.min.js', 'shp.min.js', 'togeojson.umd.js', 'xlsx.full.min.js', 'jszip.min.js']:
    code = open('lib/' + lib).read().replace('</script>', '<\\/script>')
    st = st.replace(f'<script src="lib/{lib}"></script>', '<script>\n' + code + '\n</script>')
st = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
      '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
      + st.replace('<header>', '</head>\n<body>\n<header>', 1) + '\n</body>\n</html>\n')
open('Gridrich.html', 'w').write(st)
print('built', os.path.getsize('app.html'), os.path.getsize('Gridrich.html'))
