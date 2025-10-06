const DEFAULT_MAX_DIMENSION = 512;
const MIME_EXTENSION_MAP = new Map<string, string>([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["image/avif", ".avif"],
]);

function getFileExtension(type: string): string {
  return MIME_EXTENSION_MAP.get(type) ?? ".jpg";
}

function pickTargetType(originalType: string): {
  type: string;
  quality?: number;
} {
  switch (originalType) {
    case "image/png":
      return { type: "image/png" };
    case "image/webp":
      return { type: "image/webp", quality: 0.8 };
    case "image/avif":
      // Canvas AVIF encoding support is still limited; fall back to WebP when possible.
      return { type: "image/webp", quality: 0.8 };
    case "image/jpeg":
    default:
      return { type: "image/jpeg", quality: 0.8 };
  }
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (blob) {
        resolve(blob);
        return;
      }
      if (type !== "image/png") {
        canvas.toBlob((fallbackBlob) => {
          if (fallbackBlob) {
            resolve(fallbackBlob);
          } else {
            reject(new Error("Failed to encode image"));
          }
        }, "image/png");
        return;
      }
      reject(new Error("Failed to encode image"));
    }, type, quality);
  });
}

async function drawImageToCanvas(
  file: File,
  maxDimension: number
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to prepare canvas context");
  }

  const assignDimensions = (width: number, height: number) => {
    const scale = Math.min(1, maxDimension / Math.max(width, height));
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    return { targetWidth, targetHeight };
  };

  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, {
        imageOrientation: "from-image",
      } as ImageBitmapOptions);
      const { targetWidth, targetHeight } = assignDimensions(
        bitmap.width,
        bitmap.height
      );
      ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
      bitmap.close();
      return canvas;
    } catch (error) {
      console.warn("createImageBitmap failed, falling back to Image", error);
    }
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = objectUrl;
    });
    const { targetWidth, targetHeight } = assignDimensions(
      image.naturalWidth || image.width,
      image.naturalHeight || image.height
    );
    ctx.drawImage(image, 0, 0, targetWidth, targetHeight);
    return canvas;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function optimizeProfileImageFile(
  file: File,
  maxDimension: number = DEFAULT_MAX_DIMENSION
): Promise<File> {
  const canvas = await drawImageToCanvas(file, maxDimension);
  const { type, quality } = pickTargetType(file.type);
  const blob = await canvasToBlob(canvas, type, quality);
  const extension = getFileExtension(blob.type || type);
  const baseName = file.name.replace(/\.[^.]+$/, "");
  const optimizedName = `${baseName}${extension}`;
  return new File([blob], optimizedName, {
    type: blob.type || type,
    lastModified: Date.now(),
  });
}
