from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from config import DATABASE_URL

# PostgreSQL engine with connection pooling
engine = create_engine(
    DATABASE_URL,
    pool_size=5,          # number of persistent connections
    max_overflow=10,      # extra connections allowed under load
    pool_pre_ping=True,   # test connection health before using
    pool_recycle=300,     # recycle connections every 5 min (avoids stale connections)
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
