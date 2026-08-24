# Операционные prompts

По умолчанию содержимое этой директории игнорируется Git: одноразовые prompts
могут содержать локальные пути, инфраструктурные identifiers или другие
операционные данные.

Единственный постоянный tracked entry-point текущего deployment-процесса —
[stage-13-continue-deployment.md](stage-13-continue-deployment.md). Он намеренно
не содержит PII, secrets, exact infrastructure IDs и snapshot текущего HEAD.
Фактическое состояние берётся из tracked
[Stage 13 active state](../implementation/STAGE_13_ACTIVE_STATE.md), readiness
checklist и persistent handoff.

Остальные локальные `stage-13-*` файлы являются историческими или
role-specific ускорителями. Их нельзя выбирать как «самый свежий» источник
состояния. Если пользователь явно запускает такой prompt, его stop conditions и
role boundary действуют только для порученного scope.
