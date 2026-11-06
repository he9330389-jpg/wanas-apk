"""يولّد أيقونات WANAS من الهوية: W أبيض + نقطة صفراء على خلفية فحمية داكنة."""
from PIL import Image, ImageDraw, ImageFont
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "images")

INK = (0, 0, 0, 255)            # #000000 خلفية التطبيق
SURFACE = (32, 35, 41, 255)      # #202329 مربع اللوجو
YELLOW = (240, 201, 90, 255)     # #F0C95A
WHITE = (255, 255, 255, 255)

FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
if not os.path.exists(FONT_BOLD):
    FONT_BOLD = "/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf"


def rounded(draw, box, radius, fill):
    draw.rounded_rectangle(box, radius=radius, fill=fill)


def draw_mark(img_size, *, bg=None, tile_ratio=0.78, dot=True, letter=True, inset_scale=1.0):
    """يرسم علامة WANAS في مربع img_size."""
    img = Image.new("RGBA", (img_size, img_size), bg if bg else (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    s = img_size
    tile = s * tile_ratio * inset_scale
    x0 = (s - tile) / 2
    y0 = (s - tile) / 2
    radius = tile * 0.30
    rounded(d, (x0, y0, x0 + tile, y0 + tile), radius, SURFACE)
    # حد خفيف
    d.rounded_rectangle((x0, y0, x0 + tile, y0 + tile), radius=radius, outline=(60, 64, 74, 255), width=max(2, int(s * 0.006)))

    if letter:
        font = ImageFont.truetype(FONT_BOLD, int(tile * 0.62))
        bbox = d.textbbox((0, 0), "W", font=font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        tx = x0 + (tile - tw) / 2 - bbox[0]
        ty = y0 + (tile - th) / 2 - bbox[1] + tile * 0.03
        d.text((tx, ty), "W", font=font, fill=WHITE)

    if dot:
        r = tile * 0.085
        cx = x0 + tile * 0.775
        cy = y0 + tile * 0.225
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=YELLOW)
    return img


def save(img, name):
    path = os.path.join(OUT, name)
    img.save(path)
    print("wrote", path, img.size)


# 1) أيقونة التطبيق (كاملة، خلفية فحمية + مربع اللوجو)
icon = draw_mark(1024, bg=INK, tile_ratio=0.74)
save(icon, "icon.png")

# 2) أيقونة أندرويد التكيفية: خلفية + مقدمة (المنطقة الآمنة 66%)
fg = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
mark = draw_mark(1024, bg=None, tile_ratio=0.74, inset_scale=0.62)
fg.alpha_composite(mark)
save(fg, "android-icon-foreground.png")

bg = Image.new("RGBA", (1024, 1024), INK)
save(bg, "android-icon-background.png")

mono = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
m = draw_mark(1024, bg=None, tile_ratio=0.74, inset_scale=0.62)
# أحادية: W وحدود أبيض شفاف
px = m.load()
for y in range(m.size[1]):
    for x in range(m.size[0]):
        r, g, b, a = px[x, y]
        if a == 0:
            continue
        lum = max(r, g, b)
        px[x, y] = (255, 255, 255, int(a * (lum / 255) ** 0.6))
mono.alpha_composite(m)
save(mono, "android-icon-monochrome.png")

# 3) فافيكون
save(draw_mark(196, bg=INK, tile_ratio=0.86), "favicon.png")

# 4) شاشة البداية: العلامة بدون خلفية على الفحمي
splash = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
splash.alpha_composite(draw_mark(1024, bg=None, tile_ratio=0.72))
save(splash, "splash-icon.png")

# 5) أيقونة الإشعارات (أبيض على شفاف — أندرويد بيصبغها)
notif = Image.new("RGBA", (96, 96), (0, 0, 0, 0))
nd = ImageDraw.Draw(notif)
font = ImageFont.truetype(FONT_BOLD, 64)
bbox = nd.textbbox((0, 0), "W", font=font)
nd.text(((96 - (bbox[2] - bbox[0])) / 2 - bbox[0], (96 - (bbox[3] - bbox[1])) / 2 - bbox[1]), "W", font=font, fill=(255, 255, 255, 255))
nd.ellipse((72, 6, 90, 24), fill=(255, 255, 255, 255))
save(notif, "notification-icon.png")

# 6) شعار مربّع للويب/المعاينة (512)
save(draw_mark(512, bg=INK, tile_ratio=0.74), "wanas-logo-512.png")


# 7) صورة معاينة المشاركة (1200×630) — خلفية سوداء والعلامة في النص
og = Image.new("RGBA", (1200, 630), (0, 0, 0, 255))
mark_og = draw_mark(360, bg=None, tile_ratio=0.86)
og.alpha_composite(mark_og, (120, 135))
od = ImageDraw.Draw(og)
f_name = ImageFont.truetype(FONT_BOLD, 96)
f_tag = ImageFont.truetype(FONT_BOLD, 40)
od.text((540, 210), "WANAS", font=f_name, fill=WHITE)
od.text((545, 330), "مساحة الونس", font=f_tag, fill=YELLOW)
save(og, "og-image.png")
