import sys
from PIL import Image
src = Image.open(sys.argv[1]).convert('RGBA')
out = sys.argv[2]
def crop(r):
    x,y,w,h = r; im = src.crop((x,y,x+w,y+h)); bb = im.getchannel('A').point(lambda v: 255 if v>8 else 0).getbbox(); return im.crop(bb)
R = dict(head=(22,37,269,323), scarf=(320,63,217,356), torso=(589,59,270,358), uarm=(910,112,139,278), farm=(1131,129,123,254), mit=(1329,175,149,180),
         thigh=(23,449,270,151), shin=(354,441,179,243), boot=(599,486,212,192), frame=(9,723,630,256), ring=(1140,784,92,107))
P = {k: crop(v) for k,v in R.items()}
def sc(im, k): return im.resize((max(1,round(im.width*k)), max(1,round(im.height*k))), Image.LANCZOS)
def paste(c, im, x, y, rot=0):
    if rot: im = im.rotate(rot, resample=Image.BICUBIC, expand=True)
    c.alpha_composite(im, (round(x - im.width/2), round(y - im.height/2)))
K = 0.5  # díly dítěte vůči sáňkám
frame = P['frame']
W, H = 760, 620
c = Image.new('RGBA', (W, H))
fx, fy = 40, H - frame.height - 10
body = Image.new('RGBA', (W, H))
# sáňky (rám se sedadlem)
c.alpha_composite(frame, (fx, fy))
seatY = fy + 70   # horní plocha latí
seatX = fx + 250
# dítě: vzdálená noha (tmavší), stehno vodorovně dopředu, holeň dolů, bota
def dark(im, k=0.8):
    r,g,b,a = im.split(); f = lambda v: int(v*k); return Image.merge('RGBA', (r.point(f), g.point(f), b.point(f), a))
th = sc(P['thigh'], K); sh = sc(P['shin'], K); bt = sc(P['boot'], K*0.95)
for far in (True, False):
    d = (lambda im: dark(im)) if far else (lambda im: im)
    ox = -14 if far else 0; oy = -8 if far else 0
    paste(c, d(th), seatX + 55 + ox, seatY - 22 + oy)
    paste(c, d(sh), seatX + 125 + ox, seatY + 12 + oy, rot=-35)
    paste(c, d(bt), seatX + 158 + ox, seatY + 52 + oy)
# trup (kabát), šála, hlava
to = sc(P['torso'], K*0.95)
paste(c, to, seatX - 5, seatY - 70)
sf = sc(P['scarf'], K*0.62)
paste(c, sf, seatX + 2, seatY - 120)
# paže: drží se okraje sání (předloktí dolů dopředu)
ua = sc(P['uarm'], K*0.85); fa = sc(P['farm'], K*0.85); mt = sc(P['mit'], K*0.8)
paste(c, ua, seatX - 30, seatY - 68, rot=12)
paste(c, fa, seatX + 12, seatY - 30, rot=75)
paste(c, mt, seatX + 52, seatY - 28, rot=80)
# přední zahnutí skluznic před botami
curl = frame.crop((int(frame.width*0.80), 0, frame.width, frame.height))
c.alpha_composite(curl, (fx + int(frame.width*0.80), fy))
c.save(out + '/sled_child_body.png')
hd = sc(P['head'], K*0.95)
hd.save(out + '/sled_child_head.png')
ring = sc(P['ring'], 0.5); ring.save(out + '/sled_ring.png')
# náhled se složenou hlavou
pv = c.copy(); paste(pv, hd, seatX + 5, seatY - 175)
bg = Image.new('RGBA', pv.size, (200,205,225,255)); bg.alpha_composite(pv); bg.save(out + '/preview.png')
print('seat', seatX, seatY, 'neck', seatX+5, seatY-175+hd.height/2, 'front', fx + frame.width, fy + frame.height*0.45, 'size', W, H, 'frame', fx, fy, frame.size)
