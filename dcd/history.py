"""Session state: immutable baseline, working copy, operation history, undo, reset (FR-006, 031-034)."""
from datetime import datetime


class Session:
    def __init__(self, name, df, markers=()):
        self.name = name
        self.markers = tuple(markers)
        self.baseline = df.copy()
        self.working = df.copy()
        self.history = []
        self._undo = []
        self.version = 0  # changes after every commit/undo/reset (used to refresh UI widgets)

    def commit(self, new_df, target, strategy, affected):
        self._undo.append(self.working)
        self.working = new_df
        self.history.append({"#": len(self.history) + 1, "Target": target, "Strategy": strategy,
                             "Affected": affected, "Time": datetime.now().strftime("%H:%M:%S")})
        self.version += 1

    def undo(self) -> bool:
        if not self._undo:
            return False
        self.working = self._undo.pop()
        self.history.pop()
        self.version += 1
        return True

    def reset(self):
        self.working = self.baseline.copy()
        self.history.clear()
        self._undo.clear()
        self.version += 1
