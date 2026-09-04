"""MemoryConfig 新字段与默认值变更测试。"""
from codex_pro.config.schema import MemoryConfig


def test_local_embedding_model_default_disabled():
    cfg = MemoryConfig()
    assert cfg.local_embedding_model == ""


def test_local_embedding_model_explicit_enables():
    cfg = MemoryConfig(local_embedding_model="BAAI/bge-small-zh-v1.5")
    assert cfg.local_embedding_model == "BAAI/bge-small-zh-v1.5"


def test_rerank_disabled_by_default():
    cfg = MemoryConfig()
    assert cfg.rerank_enabled is False


def test_vector_dimensions_default_auto():
    cfg = MemoryConfig()
    assert cfg.vector_dimensions == 0


def test_vector_dimensions_explicit_respected():
    cfg = MemoryConfig(vector_dimensions=1536)
    assert cfg.vector_dimensions == 1536
