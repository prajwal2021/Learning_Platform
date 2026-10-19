from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=("../.env", ".env"), extra="ignore")

    database_url: str = "postgresql+psycopg://learning:learning@localhost:5432/learning"
    # Signs the session cookie. Must be long and random in production.
    secret_key: str = "dev-only-change-me"
    session_days: int = 30
    # True when served over HTTPS (production). The cookie is then not sent over plain HTTP.
    cookie_secure: bool = False
    # True when a reverse proxy (the Next.js server, nginx) sets X-Forwarded-For.
    trust_proxy: bool = True
    seed_dir: str = "seed"
    # The address people open the site at. Sign-in providers send people back to {public_url}/api/auth/oauth/<name>/callback.
    public_url: str = "http://localhost:3000"
    # Sign-in providers. A provider's button on the sign-in page works once its settings are filled in.
    google_client_id: str = ""
    google_client_secret: str = ""
    microsoft_client_id: str = ""
    microsoft_client_secret: str = ""
    microsoft_tenant: str = "common"  # "common" accepts work, school and personal Microsoft accounts
    apple_client_id: str = ""      # the Services ID, e.g. com.example.learn.web
    apple_team_id: str = ""
    apple_key_id: str = ""
    apple_private_key: str = ""    # contents of the .p8 file; \n in an env var is read as a line break
    # Only the offline generator uses these (python -m app.cli generate-challenge). Never sent to the browser.
    openai_api_key: str = ""
    openai_model: str = "gpt-5.5"                 # challenges
    openai_model_questions: str = "gpt-5.4-mini"  # interview questions, basic and intermediate
    openai_model_advanced: str = "gpt-5.4"        # interview questions, advanced


settings = Settings()
