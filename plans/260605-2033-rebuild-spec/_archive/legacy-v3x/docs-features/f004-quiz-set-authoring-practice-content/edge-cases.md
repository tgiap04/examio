# F004 - Quiz Set Authoring & Practice Content Edge Cases

| Scenario | What Happens | User-Facing Message |
|---|---|---|
| User creates quiz set with invalid fields | Quiz set API rejects validation | Please check the quiz set details. |
| User opens a quiz set they cannot access | Backend denies or returns not found | You do not have access to this quiz set. |
| Owner deletes a quiz set used elsewhere | Delete behavior/cascade rules Need verification | Could not delete this quiz set. Needs verification. |
| Question save fails | Detail screen should keep unsaved data visible and show error | Could not save the question. |
| Label assignment fails | Existing question/label state remains or is restored | Could not update the label. |
| Generated quiz history cannot be saved | Generation result should remain visible if possible | Could not save generated quiz. |
| Public/shared access rule is ambiguous | Client should defer to backend response | Access rules need verification. |
| Mobile quiz management action is used | UI may only update mock local state | This mobile action is not connected yet. Needs verification. |

## Artifact References
- `behavior-logic.md` BL030, BL032, BL052
- `api-map.md` API003, API006, API010, API011
- `permissions.md` PERM015-PERM017, PERM030, PERM040
