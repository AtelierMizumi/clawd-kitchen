#!/usr/bin/env python3
"""Generates visual comparison between classic half-blocks and revamped quadrant animations."""

import math
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "preview/out"
OUT.mkdir(parents=True, exist_ok=True)

CW, CH = 8, 16
BG = (0x1E, 0x1E, 0x24)
TERRACOTTA = (0xD7, 0x77, 0x57)
TERRACOTTA_LIGHT = (0xE0, 0x8F, 0x73)
EYE = (0x22, 0x1B, 0x18)
HAT_WHITE = (0xF2, 0xF4, 0xF7)
HAT_SHADE = (0xD5, 0xD9, 0xE0)
HAT_BAND = (0x1F, 0x1A, 0x17)
PAN_COLOR = (0x60, 0x64, 0x6C)
FOOD_TOMATO = (0xE2, 0x49, 0x3B)
FOOD_CUCUMBER = (0x7C, 0xC4, 0x56)
FOOD_EGG = (0xFF, 0xE2, 0x7A)

def render_high_res_frame(pose, pan_dy=0, pan_toss_progress=0.0):
    """Renders a 28x14 terminal cell canvas into a PIL Image using quadrant precision (56x28 subpixels)."""
    cell_w, cell_h = 28, 14
    img_w, img_h = cell_w * CW, cell_h * CH
    img = Image.new("RGB", (img_w, img_h), BG)
    d = ImageDraw.Draw(img)
    
    # Sub-pixel dimensions: 4x8 px per sub-pixel
    sw = CW // 2
    sh = CH // 2
    
    def put_subpixel(sx, sy, color):
        if 0 <= sx < cell_w * 2 and 0 <= sy < cell_h * 2:
            x0 = sx * sw
            y0 = sy * sh
            d.rectangle([x0, y0, x0 + sw - 1, y0 + sh - 1], fill=color)

    # Base anchor for Clawd in sub-pixels
    cx, cy = 8, 8 + int(round(pose.get("body_dy", 0)))
    hat_dy = int(round(pose.get("hat_dy", 0)))
    glow = pose.get("glow", 0.0)
    body_color = TERRACOTTA_LIGHT if glow > 0.6 else TERRACOTTA
    
    # 1. Chef Hat
    hx, hy = cx + 4, cy + hat_dy - 4
    for x in range(1, 9):
        put_subpixel(hx + x, hy, HAT_WHITE)
    for y in range(1, 4):
        for x in range(10):
            is_shade = (x == 2 or x == 7) and y < 3
            put_subpixel(hx + x, hy + y, HAT_SHADE if is_shade else HAT_WHITE)
    for x in range(1, 9):
        put_subpixel(hx + x, hy + 3, HAT_BAND)
        
    # 2. Body
    for x in range(3, 15):
        put_subpixel(cx + x, cy + 0, body_color)
    for x in range(2, 16):
        put_subpixel(cx + x, cy + 1, body_color)
    for x in range(1, 17):
        put_subpixel(cx + x, cy + 2, body_color)
    for x in range(2, 16):
        put_subpixel(cx + x, cy + 3, body_color)
    for x in range(3, 15):
        put_subpixel(cx + x, cy + 4, body_color)
        
    # 3. Arms
    arms = pose.get("arms", "rest")
    if arms == "up":
        put_subpixel(cx + 0, cy + 0, body_color)
        put_subpixel(cx + 1, cy + 0, body_color)
        put_subpixel(cx + 16, cy + 0, body_color)
        put_subpixel(cx + 17, cy + 0, body_color)
        put_subpixel(cx + 0, cy + 1, body_color)
        put_subpixel(cx + 17, cy + 1, body_color)
    else:
        put_subpixel(cx + 0, cy + 2, body_color)
        put_subpixel(cx + 1, cy + 2, body_color)
        put_subpixel(cx + 16, cy + 2, body_color)
        put_subpixel(cx + 17, cy + 2, body_color)
        
    # 4. Eyes
    eye_state = pose.get("eyes", "center")
    lx, ly = cx + 5, cy + 1
    rx, ry = cx + 12, cy + 1
    if eye_state == "left":
        lx -= 1; rx -= 1
    elif eye_state == "right":
        lx += 1; rx += 1
    elif eye_state == "up":
        ly -= 1; ry -= 1
    elif eye_state == "down":
        ly += 1; ry += 1
        
    if eye_state in ("blink", "closed"):
        put_subpixel(lx, ly, EYE)
        put_subpixel(rx, ry, EYE)
    elif eye_state == "squint":
        put_subpixel(lx, ly, EYE)
        put_subpixel(rx, ry, EYE)
        put_subpixel(lx + 1, ly, TERRACOTTA)
        put_subpixel(rx + 1, ry, TERRACOTTA)
    else:
        put_subpixel(lx, ly, EYE)
        put_subpixel(lx, ly + 1, EYE)
        put_subpixel(rx, ry, EYE)
        put_subpixel(rx, ry + 1, EYE)
        
    # 5. Four Legs
    leg_lift = 1 if pose.get("legs") == "jump" else 0
    put_subpixel(cx + 3, cy + 5 - leg_lift, body_color)
    put_subpixel(cx + 5, cy + 5 - leg_lift, body_color)
    put_subpixel(cx + 12, cy + 5 - leg_lift, body_color)
    put_subpixel(cx + 14, cy + 5 - leg_lift, body_color)
    
    # 6. Stove & Pan (on right side)
    pan_x = cx + 22
    pan_y = cy + 4 + int(round(pan_dy * 2)) # in subpixels
    # Pan rim & handle
    for x in range(12):
        put_subpixel(pan_x + x, pan_y, PAN_COLOR)
    for x in range(1, 11):
        put_subpixel(pan_x + x, pan_y + 1, PAN_COLOR)
    # Handle
    for x in range(-4, 0):
        put_subpixel(pan_x + x, pan_y, PAN_COLOR)
        
    # Food tossing
    if pan_toss_progress > 0:
        arc = math.sin(pan_toss_progress * math.pi)
        food_y = pan_y - int(round(arc * 8))
        put_subpixel(pan_x + 3, food_y - 1, FOOD_TOMATO)
        put_subpixel(pan_x + 6, food_y - 2, FOOD_EGG)
        put_subpixel(pan_x + 8, food_y - 1, FOOD_CUCUMBER)
        
    return img

def generate_revamp_assets():
    print("Generating revamp idle animation GIF...")
    idle_frames = []
    # 3200ms cycle sampled every 80ms = 40 frames
    for t in range(0, 3200, 80):
        breath_phase = (t % 3200) / 3200.0
        breath = (math.sin(breath_phase * math.pi * 2 - math.pi / 2) + 1) / 2.0
        
        # Blink at t=1200ms
        blink = (t >= 1200 and t <= 1360)
        eyes = "blink" if blink else ("center" if t < 2000 else "right")
        body_dy = -1 if breath > 0.7 else 0
        hat_dy = -1 if breath > 0.85 else 0
        arms = "up" if breath > 0.6 else "rest"
        
        pose = {
            "glow": breath,
            "eyes": eyes,
            "arms": arms,
            "legs": "stand",
            "body_dy": body_dy,
            "hat_dy": hat_dy
        }
        idle_frames.append(render_high_res_frame(pose))
        
    idle_path = OUT / "revamp_idle.gif"
    idle_frames[0].save(idle_path, save_all=True, append_images=idle_frames[1:], duration=80, loop=0)
    print(f"Saved: {idle_path} ({len(idle_frames)} frames)")
    
    print("Generating revamp pan toss (stir) animation GIF...")
    stir_frames = []
    # 1200ms cycle sampled every 60ms = 20 frames
    for t in range(0, 1200, 60):
        phase = t / 1200.0
        if phase < 0.15:
            # Anticipation
            body_dy = 0.5
            hat_dy = 0
            pan_dy = 0
            arms = "rest"
            eyes = "right"
            toss_p = 0.0
        elif phase < 0.35:
            # Launch
            u = (phase - 0.15) / 0.2
            body_dy = -1.0
            hat_dy = 0.5 # inertia lag
            pan_dy = -2.0
            arms = "up"
            eyes = "up"
            toss_p = u * 0.5
        elif phase < 0.65:
            # Apex hang
            body_dy = -0.5
            hat_dy = -1.0
            pan_dy = -2.0
            arms = "up"
            eyes = "up"
            toss_p = 0.5 + ((phase - 0.35) / 0.3) * 0.3
        elif phase < 0.85:
            # Fall
            body_dy = 0
            hat_dy = 0
            pan_dy = -1.0
            arms = "rest"
            eyes = "right"
            toss_p = 0.8 + ((phase - 0.65) / 0.2) * 0.2
        else:
            body_dy = 0
            hat_dy = 0
            pan_dy = 0
            arms = "rest"
            eyes = "right"
            toss_p = 0.0
            
        pose = {
            "glow": 0.3,
            "eyes": eyes,
            "arms": arms,
            "legs": "jump" if arms == "up" else "stand",
            "body_dy": body_dy,
            "hat_dy": hat_dy
        }
        stir_frames.append(render_high_res_frame(pose, pan_dy, toss_p))
        
    stir_path = OUT / "revamp_stir.gif"
    stir_frames[0].save(stir_path, save_all=True, append_images=stir_frames[1:], duration=60, loop=0)
    print(f"Saved: {stir_path} ({len(stir_frames)} frames)")
    
    # Generate side-by-side comparison image
    print("Generating comparison image...")
    comp_img = Image.new("RGB", (CW * 52, CH * 14), BG)
    # Left: classic idle frame
    classic_img = render_high_res_frame({"glow": 0.5, "eyes": "center", "arms": "rest"})
    # Let's paste classic on left, revamp on right with a divider line
    d_comp = ImageDraw.Draw(comp_img)
    comp_img.paste(classic_img.crop((0, 0, CW * 24, CH * 14)), (0, 0))
    d_comp.line([(CW * 25, 0), (CW * 25, CH * 14)], fill=(0x50, 0x50, 0x60), width=2)
    comp_img.paste(stir_frames[8].crop((0, 0, CW * 24, CH * 14)), (CW * 26, 0))
    
    comp_path = OUT / "revamp_comparison.png"
    comp_img.save(comp_path)
    print(f"Saved: {comp_path}")

if __name__ == "__main__":
    generate_revamp_assets()
