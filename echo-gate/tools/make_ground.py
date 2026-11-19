#!/usr/bin/env python3
"""Генератор земли Echo Gate: бесшовная текстура промёрзлой пустоши без снега (assets/ground.jpg).

Запуск: python3 echo-gate/tools/make_ground.py  (нужны numpy, scipy, Pillow). Результат лежит в репозитории, игре Python не нужен.
Приём тот же, что в играх с нарисованной землёй под изометрией (Hades, Lunarium и др.): карта высот, из неё запечённый
свет (слева-сверху), тени от камней вправо-вниз, окклюзия в трещинах и щелях. Свет запечён под камеру игры: экранный
левый верх это мировая -x, значит текстура освещена со стороны -u и тени падают в +u.
Размер тайла: TILE метров (см. CONFIG.floor.tile), RES пикселей.
"""
import sys
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, map_coordinates
from scipy.spatial import cKDTree

RES = 2048
TILE_M = 16.0
PXM = RES / TILE_M          # пикселей на метр
SEED = 7
rng = np.random.default_rng(SEED)


def fnoise(beta, seed, sigma_lo=0.0):
    """Бесшовный шум 1/f^beta (через FFT), нормирован в 0..1."""
    r = np.random.default_rng(seed)
    w = r.standard_normal((RES, RES))
    f = np.fft.fft2(w)
    fx = np.fft.fftfreq(RES)[:, None]
    fy = np.fft.fftfreq(RES)[None, :]
    k = np.sqrt(fx * fx + fy * fy)
    k[0, 0] = 1
    f *= 1.0 / (k ** beta)
    f[0, 0] = 0
    a = np.real(np.fft.ifft2(f))
    a = (a - a.min()) / (a.max() - a.min() + 1e-9)
    return a


def smooth(x, a, b):
    t = np.clip((x - a) / (b - a + 1e-9), 0, 1)
    return t * t * (3 - 2 * t)


yy, xx = np.mgrid[0:RES, 0:RES].astype(np.float32)   # xx = u (вправо), yy = v (вниз по текстуре)

# --- 1. Высота (в пикселях) -------------------------------------------------------------------------------------
H = np.zeros((RES, RES), np.float32)
H += (fnoise(2.6, 1) - 0.5) * 70.0          # пологие бугры и впадины
H += (fnoise(1.9, 2) - 0.5) * 22.0          # средняя неровность
H += (fnoise(1.2, 3) - 0.5) * 5.0           # зерно мёрзлой земли

# Трещины мерзлоты: границы ячеек Вороного со сдвигом координат (кривые, ветвящиеся), на тороидальной сетке.
npts = 70
pts = rng.random((npts, 2)) * RES
tree = cKDTree(pts, boxsize=RES)
warp_u = (fnoise(2.2, 11) - 0.5) * 120.0
warp_v = (fnoise(2.2, 12) - 0.5) * 120.0
q = np.stack(((xx + warp_u) % RES, (yy + warp_v) % RES), -1).reshape(-1, 2)
d, _ = tree.query(q, k=2)
edge = (d[:, 1] - d[:, 0]).reshape(RES, RES)          # 0 на границе ячеек
vis = smooth(fnoise(1.6, 13) * 0.7 + fnoise(0.9, 14) * 0.3, 0.46, 0.60)   # видна только часть трещин, они рвутся на куски
crack = (1.0 - smooth(edge, 0.0, 6.5)) * vis                 # 1 в самой трещине
crack_fine = (1.0 - smooth(edge, 0.0, 2.2)) * vis
H -= crack * 8.0
# Края ячеек чуть приподняты (вспучивание), будто плиты земли разошлись.
H += smooth(edge, 6.0, 40.0) * 4.0

# --- 2. Камни и галька -------------------------------------------------------------------------------------------
tone = np.ones((RES, RES), np.float32)    # множитель яркости камня
stone_mask = np.zeros((RES, RES), np.float32)


def add_stone(cx, cy, R, hmax, ang, aspect, t):
    """Один камень: гладкий огранённый бугор. Рисуется в окне с заворотом по краям (бесшовно)."""
    m = int(R * 1.6) + 2
    ys = (np.arange(-m, m + 1) + int(cy)) % RES
    xs = (np.arange(-m, m + 1) + int(cx)) % RES
    gy, gx = np.mgrid[-m:m + 1, -m:m + 1].astype(np.float32)
    ca, sa = np.cos(ang), np.sin(ang)
    px = (gx * ca + gy * sa) / R
    py = (-gx * sa + gy * ca) / (R * aspect)
    # супер-эллипс с грубой огранкой (low-poly): угловой шум в радиусе
    th = np.arctan2(py, px)
    fa = 0.10 if R > 14 else 0.04
    facet = 1 + fa * np.cos(th * 5 + t * 9) + fa * 0.7 * np.cos(th * 3 + t * 4)
    r = np.sqrt(px * px + py * py) / facet
    body = np.clip(1 - r ** 2.4, 0, 1) ** 0.55
    # плоская верхняя грань: чуть срезаем вершину
    body = np.minimum(body, 0.82) / 0.82
    h = body * hmax
    sel = np.ix_(ys, xs)
    cur = H[sel]
    mask = body > 0.02
    H[sel] = np.where(mask, np.maximum(cur, cur * (1 - body) + h), cur)  # камень вырастает из земли
    stone_mask[sel] = np.maximum(stone_mask[sel], (body > 0.05).astype(np.float32))
    tone[sel] = np.where(mask, 0.80 + 0.22 * t + 0.08 * body, tone[sel])


for _ in range(46):                                      # крупные
    R = rng.uniform(26, 62)
    add_stone(rng.uniform(0, RES), rng.uniform(0, RES), R, R * rng.uniform(0.35, 0.6), rng.uniform(0, 6.28), rng.uniform(0.6, 1.0), rng.random())
for _ in range(420):                                     # средние
    R = rng.uniform(9, 22)
    add_stone(rng.uniform(0, RES), rng.uniform(0, RES), R, R * rng.uniform(0.3, 0.55), rng.uniform(0, 6.28), rng.uniform(0.6, 1.0), rng.random())
for _ in range(2600):                                    # галька
    R = rng.uniform(2.5, 7)
    add_stone(rng.uniform(0, RES), rng.uniform(0, RES), R, R * rng.uniform(0.3, 0.6), rng.uniform(0, 6.28), rng.uniform(0.6, 1.0), rng.random())

H = gaussian_filter(H, 0.8, mode='wrap')

# --- 3. Свет: нормали, тени, окклюзия ----------------------------------------------------------------------------
gu = (np.roll(H, -1, 1) - np.roll(H, 1, 1)) * 0.5     # dH/du
gv = (np.roll(H, -1, 0) - np.roll(H, 1, 0)) * 0.5
K = 1.7
nx, ny, nz = -gu * K, -gv * K, np.ones_like(H)
nl = np.sqrt(nx * nx + ny * ny + nz * nz)
nx, ny, nz = nx / nl, ny / nl, nz / nl
el = np.radians(38)                                    # высота «солнца»
# свет приходит слева (со стороны -u) и чуть сверху по v (экранный верх)
Lx, Ly, Lz = -np.cos(el) * 0.96, -np.cos(el) * 0.28, np.sin(el)
ln = np.sqrt(Lx * Lx + Ly * Ly + Lz * Lz)
Lx, Ly, Lz = Lx / ln, Ly / ln, Lz / ln
lam = np.clip(nx * Lx + ny * Ly + nz * Lz, 0, 1)
lam /= np.clip(Lz, 0.2, 1)                              # плоская земля ~1

# Тени: идём от точки навстречу свету и ищем более высокую точку.
shadow = np.zeros_like(H)
tan_el = np.tan(el)
for s in range(2, 90, 2):
    sh = np.roll(np.roll(H, s, 1), int(round(s * 0.29)), 0)  # высота в точке на расстоянии s к свету (вдоль -u, чуть вверх по v)
    shadow = np.maximum(shadow, np.clip((sh - s * tan_el - H) / 6.0, 0, 1))
shadow = gaussian_filter(shadow, 1.6, mode='wrap')

# Окклюзия: впадины и стыки темнее.
ao = np.clip(1.0 - (gaussian_filter(H, 9, mode='wrap') - H) / 26.0, 0.0, 1.0)
ao = 0.66 + 0.34 * ao ** 1.3
ao *= 1.0 - 0.35 * crack

# --- 4. Цвет ------------------------------------------------------------------------------------------------------
col_dark = np.array([0.150, 0.188, 0.262])   # тёмная мёрзлая земля
col_mid = np.array([0.243, 0.292, 0.388])
col_lite = np.array([0.318, 0.368, 0.470])
col_dust = np.array([0.270, 0.295, 0.370])   # сероватая пыльная земля, лёгкий тёплый сдвиг
col_stone = np.array([0.285, 0.330, 0.420])
col_frost = np.array([0.560, 0.670, 0.820])  # иней: бледно-голубой, не белый

lum = fnoise(2.0, 21)
base = col_dark[None, None] * (1 - lum[..., None]) + col_lite[None, None] * lum[..., None]
base = base * 0.45 + col_mid[None, None] * 0.55 + (base - col_mid[None, None]) * 0.45
dust = smooth(fnoise(2.4, 22), 0.5, 0.78)[..., None] * 0.55
base = base * (1 - dust) + col_dust[None, None] * dust * (0.85 + 0.3 * fnoise(1.5, 23)[..., None])
grain = (fnoise(0.7, 24) - 0.5)
base = base * (1 + grain[..., None] * 0.20)

sm = stone_mask[..., None] * 0.7
stone_col = col_stone[None, None] * tone[..., None] * (0.9 + 0.2 * fnoise(1.3, 25)[..., None])
base = base * (1 - sm) + stone_col * sm

# Иней: тонкая бледная кайма трещин и еле заметный налёт во впадинах.
rime = np.clip(crack_fine * 0.9 + crack * 0.25, 0, 1)
hoar = smooth(fnoise(2.3, 26), 0.66, 0.88) * smooth(gaussian_filter(-H, 6, mode='wrap'), -4.0, 6.0) * 0.10
frost = np.clip(rime * 0.40 + hoar, 0, 0.45)[..., None]
base = base * (1 - frost) + col_frost[None, None] * frost

# Свет и тень: тени холодные (не чёрные), свет слегка теплее.
cool = np.array([0.80, 0.88, 1.12])
warm = np.array([1.02, 1.01, 1.0])
light = (0.58 + 0.46 * lam)[..., None]
img = base * light * ao[..., None]
img = img * (1 - 0.40 * shadow[..., None])
img = img * (warm[None, None] * (1 - shadow[..., None] * 0.5) + cool[None, None] * (shadow[..., None] * 0.5))

# Мелкие тёмные вкрапления (комки и камешки) и светлые блики для «живости».
fleck = smooth(fnoise(0.3, 31), 0.80, 0.93)[..., None]
img = img * (1 - 0.20 * fleck)
img = np.clip(img, 0, 1)

# Выравниваем общую яркость к целевой, чтобы земля не спорила с героем и врагами.
target = 0.29
m = float(np.mean(img[..., 0] * 0.3 + img[..., 1] * 0.59 + img[..., 2] * 0.11))
img = np.clip(img * (target / m), 0, 1)

out = (img * 255).astype(np.uint8)   # палитра задана сразу в sRGB, как цвета в config.js
path = sys.argv[1] if len(sys.argv) > 1 else 'echo-gate/assets/ground.jpg'
Image.fromarray(out).save(path, quality=86, optimize=True, progressive=True)
print('saved', path, 'mean lum', round(m, 3))
