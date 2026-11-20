#!/usr/bin/env python3
"""Генератор земли Echo Gate: бесшовная минималистичная low-poly текстура промёрзлой пустоши без снега (assets/ground.jpg).

Запуск: python3 echo-gate/tools/make_ground.py  (нужны numpy, Pillow). Результат лежит в репозитории, игре Python не нужен.
Стиль игры: холодная тёмно-синяя палитра, крупные плоские грани, мягкий свет сверху-слева. Земля = сетка крупных треугольников
со смещёнными узлами и небольшой разницей высот, каждая грань освещена плоско (свет запечён), поверх несколько очень мягких
крупных пятен тона. Ни трещин, ни гальки, ни зерна: детали дают объекты поверх земли.
Размер тайла: TILE_M метров (см. CONFIG.floor.tile), RES пикселей.
"""
import sys
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter

RES = 1024            # итоговый размер
SS = 2                # суперсэмплинг для гладких краёв
TILE_M = 16.0
N = 6                 # граней в ряду тайла (бесшовность требует целого числа клеток)
CELL_M = TILE_M / N   # шаг сетки граней, м (около 2,7)
SEED = 11
rng = np.random.default_rng(SEED)


def fnoise(res, beta, seed):
    """Бесшовный шум 1/f^beta, 0..1."""
    r = np.random.default_rng(seed)
    f = np.fft.fft2(r.standard_normal((res, res)))
    fx = np.fft.fftfreq(res)[:, None]
    fy = np.fft.fftfreq(res)[None, :]
    k = np.sqrt(fx * fx + fy * fy)
    k[0, 0] = 1
    f *= 1.0 / (k ** beta)
    f[0, 0] = 0
    a = np.real(np.fft.ifft2(f))
    return (a - a.min()) / (a.max() - a.min() + 1e-9)


# --- Вершины: узлы сетки со смещением и высотой (бесшовно: индексы по модулю N) ---------------------------------
jit = (rng.random((N, N, 2)) - 0.5) * 0.8
hn = fnoise(64, 2.2, 3)                                   # плавный рельеф
heights = np.zeros((N, N))
for i in range(N):
    for j in range(N):
        heights[i, j] = (hn[int((i + 0.5) / N * 64) % 64, int((j + 0.5) / N * 64) % 64] - 0.5) * 1.1 + (rng.random() - 0.5) * 0.4


def vert(i, j):
    """Положение вершины в метрах (x, z) и высота; i, j могут выходить за N: тайл повторяется."""
    ii, jj = i % N, j % N
    x = (i + 0.5 + jit[ii, jj, 0]) * CELL_M
    z = (j + 0.5 + jit[ii, jj, 1]) * CELL_M
    return x, z, heights[ii, jj]


# --- Грани ---------------------------------------------------------------------------------------------------------
# палитра в sRGB (как цвета в config.js): базовый тон земли и лёгкий сдвиг по граням
base = np.array([0.255, 0.305, 0.405])       # чуть светлее старого #3d4a63, чтобы свет не уводил в тьму
elev = np.radians(42)
L = np.array([-np.cos(elev) * 0.97, np.sin(elev), -np.cos(elev) * 0.25])   # к свету: слева (−x), чуть «сверху» экрана (−z)
L /= np.linalg.norm(L)
flat = L[1]

S = RES * SS
scale = S / TILE_M
img = Image.new('RGB', (S, S), tuple(int(c * 255) for c in base))
dr = ImageDraw.Draw(img)

big = fnoise(256, 3.0, 5)        # крупные пятна тона
mid = fnoise(256, 2.2, 6)


def sample(a, x, z):
    h, w = a.shape
    return a[int((z / TILE_M) % 1 * h) % h, int((x / TILE_M) % 1 * w) % w]


tris = []
for j in range(N):
    for i in range(N):
        v00, v10, v01, v11 = vert(i, j), vert(i + 1, j), vert(i, j + 1), vert(i + 1, j + 1)
        if rng.random() < 0.5:
            tris += [(v00, v10, v11), (v00, v11, v01)]
        else:
            tris += [(v00, v10, v01), (v10, v11, v01)]

for a, b, c in tris:
    pa, pb, pc = np.array([a[0], a[2], a[1]]), np.array([b[0], b[2], b[1]]), np.array([c[0], c[2], c[1]])   # (x, высота, z)
    n = np.cross(pc - pa, pb - pa)
    if n[1] < 0:
        n = -n
    n /= np.linalg.norm(n)
    lam = float(np.clip(np.clip(n @ L, 0, 1) / flat, 0.7, 1.15))   # 1 на плоскости; крутые грани не темнее 0,7
    cx, cz = (a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3
    tone = 1.0 + (lam - 1.0) * 0.22                                 # свет мягкий: грани различаются, но не контрастят
    tone *= 1.0 + (rng.random() - 0.5) * 0.025                       # лёгкий случайный разброс
    tone *= 1.0 + (sample(big, cx, cz) - 0.5) * 0.08 + (sample(mid, cx, cz) - 0.5) * 0.03
    col = base * tone
    col = col * (1 + np.array([-0.012, 0.0, 0.015]) * (lam - 1.0) * 6)   # свет чуть теплее, тень чуть холоднее
    rgb = tuple(int(np.clip(v, 0, 1) * 255) for v in col)
    pts = [(p[0] * scale, p[1] * scale) for p in ((a[0], a[1]), (b[0], b[1]), (c[0], c[1]))]
    for ox in (-S, 0, S):
        for oz in (-S, 0, S):
            dr.polygon([(x + ox, y + oz) for x, y in pts], fill=rgb)

arr = np.asarray(img).astype(np.float32) / 255.0

# Несколько очень мягких крупных пятен (впадины темнее, редкие светлые намёты), без резких краёв.
yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
patch = np.zeros((S, S), np.float32)
for _ in range(7):
    cx, cy = rng.random() * S, rng.random() * S
    r = rng.uniform(0.07, 0.14) * S
    sgn = -1 if rng.random() < 0.65 else 1
    for ox in (-S, 0, S):
        for oy in (-S, 0, S):
            d2 = ((xx - cx - ox) ** 2 + (yy - cy - oy) ** 2) / (r * r)
            patch += sgn * np.exp(-d2 * 1.6) * 0.035
arr = arr * (1 + patch[..., None])
arr = np.clip(arr, 0, 1)

out = Image.fromarray((arr * 255).astype(np.uint8)).resize((RES, RES), Image.LANCZOS)
path = sys.argv[1] if len(sys.argv) > 1 else 'echo-gate/assets/ground.jpg'
out.save(path, quality=90, optimize=True)
m = np.asarray(out).astype(np.float32) / 255
print('saved', path, 'mean rgb', m.reshape(-1, 3).mean(0).round(3))
