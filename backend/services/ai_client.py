import base64
from groq import Groq
from config import GROQ_API_KEY, GROQ_MODEL, GROQ_MODEL_LARGE, GROQ_VISION_MODEL

_client: Groq = None


def _get_client() -> Groq:
    global _client
    if _client is None:
        if not GROQ_API_KEY or GROQ_API_KEY == "your_groq_api_key_here":
            raise ValueError(
                "GROQ_API_KEY not configured.\n"
                "1. Go to https://console.groq.com\n"
                "2. Create a free API key\n"
                "3. Add it to backend/.env as GROQ_API_KEY=..."
            )
        _client = Groq(api_key=GROQ_API_KEY)
    return _client


def generate(prompt: str, temperature: float = 0.7, large: bool = False) -> str:
    """
    Generate text using Groq (Llama 3).
    large=True uses llama-3.3-70b-versatile for better quality (analysis, summaries).
    large=False uses llama-3.1-8b-instant for speed (quiz, tutor answers).
    """
    client = _get_client()
    model = GROQ_MODEL_LARGE if large else GROQ_MODEL
    try:
        response = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            temperature=temperature,
            max_tokens=4096,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        raise RuntimeError(f"Groq API error: {e}")


def generate_with_image(image_bytes: bytes, prompt: str) -> str:
    """
    Send a page image to Groq's vision model for OCR / image understanding.
    image_bytes: raw PNG bytes of the page.
    """
    client = _get_client()
    image_b64 = base64.b64encode(image_bytes).decode("utf-8")
    try:
        response = client.chat.completions.create(
            model=GROQ_VISION_MODEL,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:image/png;base64,{image_b64}"},
                        },
                        {"type": "text", "text": prompt},
                    ],
                }
            ],
            temperature=0.1,
            max_tokens=4096,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        raise RuntimeError(f"Groq vision API error: {e}")


def is_configured() -> bool:
    return bool(GROQ_API_KEY and GROQ_API_KEY != "your_groq_api_key_here")
