"""Render one model-written Manim scene inside a restricted interpreter.

Usage: python manim_runner.py <scene.py> <out_dir> <quality l|m|h>

The scene code comes from a language model, which may in turn have read text
from a user's upload, so it is treated as untrusted:

1. The AST is checked before anything runs. Imports are limited to manim and a
   few maths modules, names and attributes that reach files, processes, the
   interpreter or Manim's config are refused, and so is any name or attribute
   that starts with an underscore (the usual route out of a sandbox).
2. The code is executed with a reduced set of builtins and an import hook that
   enforces the same allowlist at run time.
3. The process gets CPU, memory and file-size limits, a clean environment
   (no API keys), and a scratch working directory. TeX, when present, runs in
   kpathsea's paranoid mode and without shell escape.

Narration: when <out_dir>/narration.json exists (written by the app, with one
entry per spoken line: text, duration in seconds, and optionally a WAV file
synthesized by MioTTS), the scene can call narrate(self, i) to start line i.
It adds the audio at the current scene time and returns the line's duration,
so the scene can time its animations to the voice. The runner records when
each line starts and writes captions.vtt next to the video.

The last line on stdout is a JSON object: {"ok": true, "file": ..., "seconds": ...}
or {"ok": false, "error": ...}.
"""

from __future__ import annotations

import ast
import builtins
import json
import os
import re
import sys
import time
import traceback

ALLOWED_MODULES = {"manim", "numpy", "math", "random", "itertools", "functools", "colorsys", "fractions"}

# Refused as bare names and as attribute names.
DENY = {
    # interpreter and introspection
    "open", "exec", "eval", "compile", "globals", "locals", "vars", "getattr", "setattr", "delattr",
    "input", "breakpoint", "exit", "quit", "help", "memoryview", "type",
    "gi_frame", "gi_code", "cr_frame", "cr_code", "ag_frame", "ag_code", "f_back", "f_globals", "f_locals",
    "f_builtins", "f_code", "tb_frame", "tb_next", "func_globals", "co_code", "mro",
    # modules and functions that reach the OS, files or the network
    "os", "sys", "subprocess", "system", "popen", "spawn", "spawnv", "execv", "execve", "fork", "kill",
    "environ", "path", "shutil", "pathlib", "Path", "socket", "urllib", "request", "http", "requests",
    "pickle", "marshal", "shelve", "tempfile", "io", "codecs", "glob", "importlib", "import_module",
    "builtins", "ctypes", "cffi", "multiprocessing", "threading", "signal", "inspect", "gc", "weakref",
    "sysconfig", "site", "platform", "pty", "fcntl", "posix", "resource", "mmap", "asyncio", "select",
    "load", "loads", "save", "savez", "savez_compressed", "savetxt", "loadtxt", "genfromtxt", "fromfile",
    "tofile", "fromregex", "memmap", "lib", "ctypeslib", "f2py", "distutils", "testing", "dump", "dumps",
    "read_text", "read_bytes", "write_text", "write_bytes",
    # Manim features that read files, write files or change global config
    "config", "tempconfig", "ManimConfig", "logger", "console", "error_console", "file_ops", "file_writer",
    "SceneFileWriter", "Code", "SVGMobject", "ImageMobject", "ImageMobjectFromCamera", "add_sound",
    "TexTemplate", "TexTemplateLibrary", "TexFontTemplates", "tex_template", "register_font", "manimpango",
    "cairo", "moderngl", "renderer", "camera_config", "media_dir", "output_file",
}

# TeX commands that read or write files or redefine the tokenizer.
TEX_DENY = re.compile(
    r"\\(input|include|openin|openout|read|write|immediate|catcode|verbatiminput|lstinputlisting|"
    r"usepackage|RequirePackage|InputIfFileExists|includegraphics|special|csname|jobname|directlua|"
    r"pdffiledump|pdfximage|filecontents|ShellEscape)\b"
)

SCENE_BASES = {"Scene", "MovingCameraScene", "ThreeDScene", "ZoomedScene", "VectorScene", "LinearTransformationScene"}

MAX_CODE = 12_000


class Rejected(Exception):
    pass


def validate(code: str) -> str:
    """Checks the code and returns the name of the scene class to render."""
    if len(code) > MAX_CODE:
        raise Rejected("The scene is longer than 12,000 characters.")
    try:
        tree = ast.parse(code, mode="exec")
    except SyntaxError as e:
        raise Rejected(f"SyntaxError: {e.msg} (line {e.lineno})")

    scenes: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name.split(".")[0] not in ALLOWED_MODULES or "." in alias.name:
                    raise Rejected(f"Importing {alias.name} is not allowed.")
        elif isinstance(node, ast.ImportFrom):
            if node.level or not node.module or node.module.split(".")[0] not in ALLOWED_MODULES or "." in node.module:
                raise Rejected(f"Importing from {node.module} is not allowed.")
            for alias in node.names:
                if alias.name in DENY or alias.name.startswith("_"):
                    raise Rejected(f"Importing {alias.name} is not allowed.")
        elif isinstance(node, ast.Name):
            if node.id.startswith("_") or node.id in DENY:
                raise Rejected(f"The name {node.id} is not allowed in a scene.")
        elif isinstance(node, ast.Attribute):
            if node.attr.startswith("_") or node.attr in DENY:
                raise Rejected(f"The attribute .{node.attr} is not allowed in a scene.")
        elif isinstance(node, (ast.Global, ast.Nonlocal)):
            raise Rejected("global and nonlocal are not allowed in a scene.")
        elif isinstance(node, ast.Constant) and isinstance(node.value, str):
            m = TEX_DENY.search(node.value)
            if m:
                raise Rejected(f"The TeX command \\{m.group(1)} is not allowed.")
        elif isinstance(node, ast.FunctionDef) and node.name.startswith("_") and node.name != "__init__":
            raise Rejected(f"The method name {node.name} is not allowed.")
        elif isinstance(node, ast.ClassDef):
            bases = {b.id for b in node.bases if isinstance(b, ast.Name)}
            if bases & SCENE_BASES:
                scenes.append(node.name)
    if not scenes:
        raise Rejected("No Scene subclass found. Define one class that extends Scene with a construct method.")
    return scenes[-1]


SAFE_BUILTIN_NAMES = [
    "abs", "all", "any", "bool", "dict", "divmod", "enumerate", "filter", "float", "format", "frozenset", "int",
    "isinstance", "issubclass", "len", "list", "map", "max", "min", "pow", "print", "range", "repr", "reversed",
    "round", "set", "slice", "sorted", "str", "sum", "tuple", "zip", "complex", "chr", "ord", "hash", "iter",
    "next", "super", "object", "property", "staticmethod", "classmethod", "callable", "id",
    "Exception", "ValueError", "TypeError", "ZeroDivisionError", "IndexError", "KeyError", "StopIteration",
    "ArithmeticError", "RuntimeError", "NotImplementedError", "AttributeError", "NotImplemented",
]


def restricted_import(name, globals=None, locals=None, fromlist=(), level=0):
    if level or name.split(".")[0] not in ALLOWED_MODULES or "." in name:
        raise ImportError(f"Importing {name} is not allowed.")
    return builtins.__import__(name, globals, locals, fromlist, level)


def limit_resources() -> None:
    try:
        import resource

        cpu = int(os.environ.get("LEMMA_MANIM_CPU_SECONDS", "150"))
        resource.setrlimit(resource.RLIMIT_CPU, (cpu, cpu + 5))
        mem = int(os.environ.get("LEMMA_MANIM_MEMORY_MB", "4096")) * 1024 * 1024
        resource.setrlimit(resource.RLIMIT_AS, (mem, mem))
        size = 512 * 1024 * 1024
        resource.setrlimit(resource.RLIMIT_FSIZE, (size, size))
    except Exception:
        pass  # not available on this platform


def load_narration(out_dir: str) -> list[dict]:
    path = os.path.join(out_dir, "narration.json")
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as f:
        items = json.load(f)
    clean = []
    for item in items[:12]:
        file = item.get("file")
        # Only files the app wrote into this render's own directory.
        if file and os.path.dirname(os.path.abspath(file)) != os.path.abspath(out_dir):
            file = None
        clean.append({"text": str(item.get("text", ""))[:400], "duration": float(item.get("duration", 2.0)), "file": file})
    return clean


def make_narrate(narration: list[dict], cues: list[tuple[float, float, str]]):
    def narrate(scene, i):
        if not isinstance(i, int) or not 0 <= i < len(narration):
            raise IndexError(f"narrate: there is no narration line {i}; lines are 0 to {len(narration) - 1}")
        item = narration[i]
        start = float(scene.time)
        if item["file"]:
            scene.add_sound(item["file"])
        cues.append((start, start + item["duration"], item["text"]))
        return item["duration"]

    return narrate


def vtt_time(t: float) -> str:
    ms = int(round(t * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    sec, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{sec:02d}.{ms:03d}"


def write_captions(out_dir: str, cues: list[tuple[float, float, str]]) -> None:
    if not cues:
        return
    lines = ["WEBVTT", ""]
    for n, (start, end, text) in enumerate(sorted(cues), 1):
        lines += [str(n), f"{vtt_time(start)} --> {vtt_time(end)}", text.replace("-->", "->"), ""]
    with open(os.path.join(out_dir, "captions.vtt"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


def emit(result: dict) -> None:
    sys.stdout.write("\n" + json.dumps(result) + "\n")
    sys.stdout.flush()


def main() -> int:
    scene_path, out_dir, quality = sys.argv[1], sys.argv[2], (sys.argv[3] if len(sys.argv) > 3 else "l")
    with open(scene_path, encoding="utf-8") as f:
        code = f.read()
    try:
        scene_name = validate(code)
    except Rejected as e:
        emit({"ok": False, "error": str(e), "stage": "validate"})
        return 2

    limit_resources()
    os.chdir(out_dir)
    started = time.time()
    try:
        from manim import config as manim_config

        quality_name = {"l": "low_quality", "m": "medium_quality", "h": "high_quality"}.get(quality, "low_quality")
        manim_config.quality = quality_name
        manim_config.media_dir = out_dir
        manim_config.video_dir = out_dir
        manim_config.images_dir = os.path.join(out_dir, "images")
        manim_config.tex_dir = os.path.join(out_dir, "tex")
        manim_config.text_dir = os.path.join(out_dir, "text")
        manim_config.partial_movie_dir = os.path.join(out_dir, "partial")
        manim_config.output_file = "video"
        manim_config.disable_caching = True
        manim_config.preview = False
        manim_config.write_to_movie = True
        manim_config.format = "mp4"
        manim_config.verbosity = "WARNING"
        manim_config.progress_bar = "none"

        safe = {n: getattr(builtins, n) for n in SAFE_BUILTIN_NAMES if hasattr(builtins, n)}
        safe["__build_class__"] = builtins.__build_class__
        safe["__import__"] = restricted_import
        narration = load_narration(out_dir)
        cues: list[tuple[float, float, str]] = []
        namespace = {"__builtins__": safe, "__name__": "lemma_scene", "narrate": make_narrate(narration, cues)}
        exec(compile(ast.parse(code), "scene.py", "exec"), namespace)  # noqa: S102 - validated above
        scene_cls = namespace[scene_name]

        # Let the last spoken line finish before the video ends.
        scene_construct = scene_cls.construct

        def construct(self):
            scene_construct(self)
            end = max((c[1] for c in cues), default=0.0)
            if end > self.time + 0.05:
                self.wait(end - self.time + 0.3)

        scene_cls.construct = construct
        scene_cls().render()
        write_captions(out_dir, cues)
    except BaseException as e:  # report everything, including SystemExit from inside manim
        tb = traceback.format_exc()
        lines = [l for l in tb.splitlines() if 'File "scene.py"' in l or not l.startswith("  File ")]
        detail = "\n".join(lines[-25:])
        emit({"ok": False, "error": f"{type(e).__name__}: {e}"[:600], "traceback": detail[-2500:], "stage": "render"})
        return 1

    video = os.path.join(out_dir, "video.mp4")
    if not os.path.exists(video):
        for root, _dirs, files in os.walk(out_dir):
            mp4 = [f for f in files if f.endswith(".mp4") and "partial" not in root]
            if mp4:
                os.replace(os.path.join(root, mp4[0]), video)
                break
    if not os.path.exists(video):
        emit({"ok": False, "error": "The scene rendered no frames. Add at least one self.play or self.wait.", "stage": "render"})
        return 1
    # The last frame is the finished picture: use it as the video's poster.
    try:
        import av

        last = None
        with av.open(video) as container:
            for frame in container.decode(video=0):
                last = frame
        if last is not None:
            last.to_image().convert("RGB").save(os.path.join(out_dir, "poster.jpg"), quality=85)
    except Exception:
        pass
    emit({
        "ok": True,
        "file": video,
        "seconds": round(time.time() - started, 1),
        "scene": scene_name,
        "captions": os.path.exists(os.path.join(out_dir, "captions.vtt")),
    })
    return 0


if __name__ == "__main__":
    sys.exit(main())
