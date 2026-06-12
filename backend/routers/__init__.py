# routers package
import json
import os
import tempfile


def atomic_json_write(filepath: str, data, **kwargs):
    """Write JSON data atomically: temp file -> fsync -> rename."""
    dirpath = os.path.dirname(filepath) or "."
    os.makedirs(dirpath, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=dirpath, suffix=".tmp")
    try:
        with os.fdopen(fd, "w") as f:
            json.dump(data, f, **kwargs)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, filepath)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise
