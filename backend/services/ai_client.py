import base64
from groq import Groq
import google.generativeai as genai
from config import GROQ_API_KEY, GROQ_MODEL, GROQ_MODEL_LARGE, GROQ_VISION_MODEL, GEMINI_API_KEY, GEMINI_MODEL

_client: Groq = None

# Configure Gemini for text generation (also used for embeddings)
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)


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


def generate_gemini(prompt: str, temperature: float = 0.7) -> str:
    """
    Generate text using Gemini Flash.
    Used for viva grading and as a fallback when Groq hits rate limits.

    Notes:
    - Uses a plain dict for generation_config (avoids genai.types compatibility issues
      across google-generativeai versions).
    - Tries GEMINI_MODEL first, then gemini-1.5-flash as a fallback (gemini-2.0-flash
      may not be reachable via the v1beta endpoint used by google-generativeai 0.8.x).
    - Extracts text safely to handle safety-blocked responses (response.text raises
      ValueError when content is blocked or when the response has multiple parts).
    """
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY not configured — cannot use Gemini for generation")

    last_err: Exception | None = None
    for model_name in (GEMINI_MODEL, "gemini-2.0-flash-lite", "gemini-1.5-flash-002"):
        try:
            model = genai.GenerativeModel(model_name)
            response = model.generate_content(
                prompt,
                # dict form works across all google-generativeai versions
                generation_config={
                    "temperature": temperature,
                    "max_output_tokens": 2048,
                },
            )
            # response.text raises ValueError on safety blocks or multi-part responses;
            # extract from candidates directly to be safe.
            try:
                text = response.text
            except (ValueError, AttributeError):
                candidates = getattr(response, "candidates", [])
                if candidates and getattr(candidates[0], "content", None):
                    parts = getattr(candidates[0].content, "parts", [])
                    text = " ".join(p.text for p in parts if hasattr(p, "text"))
                else:
                    raise RuntimeError(f"Gemini {model_name}: empty or blocked response")
            return text.strip()
        except RuntimeError:
            raise  # already a clean error — don't retry
        except Exception as exc:
            print(f"[ai_client] Gemini {model_name} failed: {exc}")
            last_err = exc

    raise RuntimeError(f"Gemini text generation failed on all models: {last_err}")


def generate(prompt: str, temperature: float = 0.7, large: bool = False) -> str:
    """
    Generate text using Groq (Llama 3).
    large=True uses llama-3.3-70b-versatile for better quality (analysis, summaries).
    large=False uses llama-3.1-8b-instant for speed (quiz, tutor answers).

    Automatically falls back to Gemini Flash if Groq returns a 413 / rate-limit error
    so the app keeps working even when Groq's per-minute token budget is exhausted.
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
        err_str = str(e)
        # Fall back to Gemini on rate-limit / too-large errors
        if (
            GEMINI_API_KEY
            and any(sig in err_str for sig in ("413", "rate_limit_exceeded", "tokens per minute", "Request too large"))
        ):
            print(f"[ai_client] Groq rate limit hit — falling back to Gemini Flash")
            try:
                return generate_gemini(prompt, temperature)
            except Exception as gem_err:
                raise RuntimeError(f"Groq rate-limited and Gemini fallback also failed: {gem_err}")
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
