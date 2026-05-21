from groq import Groq
from config import GROQ_API_KEY, GROQ_MODEL, GROQ_MODEL_LARGE

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


def is_configured() -> bool:
    return bool(GROQ_API_KEY and GROQ_API_KEY != "your_groq_api_key_here")
