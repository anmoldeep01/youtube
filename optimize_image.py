from PIL import Image
import os

try:
    img = Image.open('thumbnail.png')
    img = img.convert('RGB')
    # Resize to standard OG dimensions if not already
    img = img.resize((1200, 630), Image.Resampling.LANCZOS)
    
    # Save as JPEG with optimization to reduce size < 300KB
    img.save('thumbnail.jpg', 'JPEG', quality=85, optimize=True)
    
    print(f"Compressed thumbnail.jpg created. Size: {os.path.getsize('thumbnail.jpg')} bytes")
except Exception as e:
    print(f"Error: {e}")
