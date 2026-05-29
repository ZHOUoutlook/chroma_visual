from functools import lru_cache
from pathlib import Path
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    chroma_host: str = Field(default="localhost", alias="CHROMA_HOST")
    chroma_port: int = Field(default=8000, alias="CHROMA_PORT")
    mineru_api_key: str = Field(default="", alias="MINERU_API_KEY")
    mineru_api_base_url: str = Field(default="https://mineru.net", alias="MINERU_API_BASE_URL")
    mineru_poll_timeout_seconds: int = Field(default=90, alias="MINERU_POLL_TIMEOUT_SECONDS")
    mineru_poll_interval_seconds: int = Field(default=3, alias="MINERU_POLL_INTERVAL_SECONDS")
    mineru_trust_env: bool = Field(default=False, alias="MINERU_TRUST_ENV")
    mineru_data_dir: Path = Field(default=Path("../data/mineru"), alias="MINERU_DATA_DIR")
    mineru_meta_dir: Path = Field(default=Path("../data/mineru_meta"), alias="MINERU_META_DIR")
    mineru_assets_dir: Path = Field(default=Path("../data/mineru_assets"), alias="MINERU_ASSETS_DIR")
    upload_dir: Path = Field(default=Path("../data/uploads"), alias="UPLOAD_DIR")

    model_config = SettingsConfigDict(
        env_file=(ROOT_DIR / ".env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    def model_post_init(self, __context: object) -> None:
        if not self.mineru_data_dir.is_absolute():
            self.mineru_data_dir = ROOT_DIR / self.mineru_data_dir
        if not self.mineru_meta_dir.is_absolute():
            self.mineru_meta_dir = ROOT_DIR / self.mineru_meta_dir
        if not self.mineru_assets_dir.is_absolute():
            self.mineru_assets_dir = ROOT_DIR / self.mineru_assets_dir
        if not self.upload_dir.is_absolute():
            self.upload_dir = ROOT_DIR / self.upload_dir


@lru_cache
def get_settings() -> Settings:
    return Settings()
