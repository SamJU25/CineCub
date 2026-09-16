"""Turn the user's ready-made mascot.jpg (2528x1686) into the two 3x3 production WebP sheets.

This script:
1. Loads mascot.jpg from the repo root.
2. Performs flood-fill background segmentation from borders to cleanly separate the
   simulated checkerboard background without affecting internal white elements
   (the 3D glasses white frame and eye whites).
3. Eliminates background color bleed via signed distance transform and anti-aliasing.
4. Drops stray cross-cell specks while strictly preserving floating symbols
   (heart, stars, zzz).
5. Normalizes head scale and chin-anchor positions across all 18 cells on a 360x360
   tile canvas (1080x1080 sheet).
6. Atomically saves:
   - frontend/next-storefront/public/mascots/cinecub-directions.webp
   - frontend/next-storefront/public/mascots/cinecub-reactions.webp
"""

import os
import sys
import tempfile
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SOURCE_IMAGE = os.path.join(ROOT, "mascot.jpg")
DEST_DIR = os.path.join(ROOT, "frontend", "next-storefront", "public", "mascots")
os.makedirs(DEST_DIR, exist_ok=True)

TILE = 360
TARGET_WIDTH = 275.0
SCALE = TARGET_WIDTH / 405.0  # ~0.679
TARGET_BOTTOM = 310

X_SPLITS = [0, 432, 848, 1264, 1701, 2108, 2528]
Y_SPLITS = [0, 644, 1043, 1686]


def build():
    if not os.path.exists(SOURCE_IMAGE):
        print(f"Error: {SOURCE_IMAGE} not found!", file=sys.stderr)
        sys.exit(1)

    print(f"Loading {SOURCE_IMAGE}...")
    img = Image.open(SOURCE_IMAGE)
    arr = np.array(img).astype(np.float32)

    # 1. Flood-fill background detection
    chroma = arr.max(axis=2) - arr.min(axis=2)
    brightness = arr.mean(axis=2)
    is_bg_candidate = (brightness > 180) & (chroma < 14)

    labels, count = ndimage.label(is_bg_candidate)
    border_labels = set(
        np.unique(
            np.concatenate(
                [labels[0, :], labels[-1, :], labels[:, 0], labels[:, -1]]
            )
        )
    ) - {0}
    bg_mask = np.isin(labels, list(border_labels))

    # 2. Signed distance transform for antialiasing & defringing
    # The source artwork contains a 3.5px white sticker halo around the characters.
    # Contracting by 3.5px strips the white border completely, landing squarely
    # on the crisp dark brown outline with smooth 1.2px antialiasing.
    dist_out = ndimage.distance_transform_edt(bg_mask)
    dist_in = ndimage.distance_transform_edt(~bg_mask)
    signed_dist = dist_in - dist_out
    smooth_alpha = np.clip((signed_dist - 3.5) / 1.2, 0.0, 1.0) * 255.0

    rgba = np.dstack([arr.astype(np.uint8), smooth_alpha.astype(np.uint8)])
    full_im = Image.fromarray(rgba, "RGBA")

    def clean_cell(cell_img, min_accessory_size=1000):
        """Erase stray neighboring fragments touching edges while keeping main body & symbols."""
        a = np.array(cell_img)
        opaque = a[..., 3] > 40
        labels, count = ndimage.label(opaque)
        if count <= 1:
            return cell_img
        sizes = ndimage.sum(opaque, labels, range(1, count + 1))
        main_label = int(np.argmax(sizes)) + 1
        
        # Identify components that touch cell borders (bleeds from adjacent cells)
        border_labels = set(np.unique(np.concatenate([
            labels[:2, :].ravel(), labels[-2:, :].ravel(),
            labels[:, :2].ravel(), labels[:, -2:].ravel()
        ]))) - {0, main_label}

        keep = [main_label]
        for idx, s in enumerate(sizes):
            lbl_id = idx + 1
            if lbl_id != main_label and lbl_id not in border_labels and s > min_accessory_size:
                keep.append(lbl_id)
        
        a[~np.isin(labels, keep), 3] = 0
        return Image.fromarray(a, "RGBA")

    # 3. Extract 9 Directions (Columns 0, 1, 2)
    print("Processing 9 direction cells...")
    dir_tiles = []
    for r in range(3):
        for c in range(3):
            x0, x1 = X_SPLITS[c], X_SPLITS[c + 1]
            y0, y1 = Y_SPLITS[r], Y_SPLITS[r + 1]
            cell = clean_cell(full_im.crop((x0, y0, x1, y1)), min_accessory_size=1000)

            a = np.array(cell)[..., 3]
            ys, xs = np.where(a > 50)
            content = cell.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))

            sw = int(round(content.width * SCALE))
            sh = int(round(content.height * SCALE))
            resized = content.resize((sw, sh), Image.LANCZOS)

            tile_canvas = Image.new("RGBA", (TILE, TILE), (0, 0, 0, 0))
            paste_x = int(round(TILE / 2.0 - sw / 2.0))
            paste_y = int(round(TARGET_BOTTOM - sh))
            tile_canvas.paste(resized, (paste_x, paste_y), resized)
            dir_tiles.append(tile_canvas)

    # 4. Extract 9 Reactions (Columns 3, 4, 5)
    print("Processing 9 reaction cells...")
    react_tiles = []
    for r in range(3):
        for c in range(3, 6):
            x0, x1 = X_SPLITS[c], X_SPLITS[c + 1]
            y0, y1 = Y_SPLITS[r], Y_SPLITS[r + 1]
            cell = clean_cell(full_im.crop((x0, y0, x1, y1)), min_accessory_size=600)

            a = np.array(cell)[..., 3]
            lbl_clean, cnt_clean = ndimage.label(a > 50)
            sizes_clean = ndimage.sum(a > 50, lbl_clean, range(1, cnt_clean + 1))
            main_idx = int(np.argmax(sizes_clean)) + 1
            ys_main, xs_main = np.where(lbl_clean == main_idx)

            ys, xs = np.where(a > 50)
            content = cell.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))

            sw = int(round(content.width * SCALE))
            sh = int(round(content.height * SCALE))
            resized = content.resize((sw, sh), Image.LANCZOS)

            tile_canvas = Image.new("RGBA", (TILE, TILE), (0, 0, 0, 0))
            main_cx_in_content = (xs_main.min() + xs_main.max()) / 2.0 - xs.min()
            paste_x = int(round(TILE / 2.0 - main_cx_in_content * SCALE))
            chin_in_content = ys_main.max() - ys.min()
            paste_y = int(round(TARGET_BOTTOM - chin_in_content * SCALE))

            tile_canvas.paste(resized, (paste_x, paste_y), resized)
            react_tiles.append(tile_canvas)

    # 5. Assemble Sheets and Save
    dir_sheet = Image.new("RGBA", (TILE * 3, TILE * 3), (0, 0, 0, 0))
    for i, t in enumerate(dir_tiles):
        dir_sheet.paste(t, ((i % 3) * TILE, (i // 3) * TILE))

    react_sheet = Image.new("RGBA", (TILE * 3, TILE * 3), (0, 0, 0, 0))
    for i, t in enumerate(react_tiles):
        react_sheet.paste(t, ((i % 3) * TILE, (i // 3) * TILE))

    staged = [
        (dir_sheet, os.path.join(DEST_DIR, "cinecub-directions.webp")),
        (react_sheet, os.path.join(DEST_DIR, "cinecub-reactions.webp")),
    ]

    for sheet, final_path in staged:
        fd, tmp = tempfile.mkstemp(suffix=".webp", dir=DEST_DIR)
        os.close(fd)
        sheet.save(tmp, "WEBP", quality=92, method=6)
        os.chmod(tmp, 0o644)
        os.replace(tmp, final_path)
        print(f"Generated {final_path} ({os.path.getsize(final_path)} bytes)")

    print("Mascot sprite sheets successfully built and deployed!")


if __name__ == "__main__":
    build()
