"""生成应用图标（源图 1024x1024），随后用 `npx tauri icon` 派生各尺寸。"""
from PIL import Image, ImageDraw, ImageFont

S = 1024
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

# 垂直渐变底
top, bottom = (22, 35, 60), (7, 11, 18)
grad = Image.new("RGB", (1, S))
for y in range(S):
    t = y / (S - 1)
    grad.putpixel((0, y), tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3)))
grad = grad.resize((S, S))

mask = Image.new("L", (S, S), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=200, fill=255)
img.paste(grad, (0, 0), mask)

# 金色描边
draw.rounded_rectangle([14, 14, S - 15, S - 15], radius=188, outline=(200, 170, 110, 210), width=10)

# 中心「海」字
font = ImageFont.truetype("C:/Windows/Fonts/msyhbd.ttc", 520)
text = "海"
box = draw.textbbox((0, 0), text, font=font)
w, h = box[2] - box[0], box[3] - box[1]
draw.text(((S - w) / 2 - box[0], (S - h) / 2 - box[1] - 18), text, font=font, fill=(232, 211, 160, 255))

# 底部一条青色高光，呼应海克斯
draw.rounded_rectangle([S / 2 - 150, S - 175, S / 2 + 150, S - 155], radius=10, fill=(10, 200, 185, 220))

img.save("icon-src.png")
print("icon-src.png written")
