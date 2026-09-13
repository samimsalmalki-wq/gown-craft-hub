import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Avatar, Btn, Chip, Field, PriorityChip, Sheet, StageStatusChip } from "@/components/kit";
import { useCurrentAccount } from "@/hooks/useSession";
import {
  useOrder,
  useOrderFiles,
  useOrderStages,
  useProfiles,
  useSetStageScope,
  useSignedUrls,
  useStageActions,
  useStageTemplates,
  useUploadFiles,
} from "@/lib/data";
import {
  PRIORITY_LABEL,
  fmtDate,
  fmtDateTime,
  fmtDuration,
  isStageLate,
  money,
  remaining,
  stageLabel,
  stageLateDays,
  type OrderStage,
  type Priority,
} from "@/lib/atelier";

const PRIORITIES: Priority[] = ["low", "normal", "high", "urgent"];

/** سطر مرحلة في الخط الزمني */
export function StageRow({ stage, onOpen }: { stage: OrderStage; onOpen: () => void }) {
  const late = isStageLate(stage);
  return (
    <button onClick={onOpen} className="block w-full px-4 py-3.5 text-right hover:bg-ivory">
      <div className="flex flex-wrap items-center gap-2">
        <span className="num text-[13px] text-muted-foreground">{stage.position}</span>
        <span className="min-w-0 flex-1 text-[14px] font-medium">{stageLabel(stage.stage)}</span>
        {stage.rework_count > 0 && <Chip tone="late">إعادة عمل ×{stage.rework_count}</Chip>}
        {late && <Chip tone="late">متأخرة {stageLateDays(stage)} يوم</Chip>}
        {!stage.is_required && <Chip>غير مطلوبة</Chip>}
        <StageStatusChip status={stage.status} />
      </div>
      <div className="mt-1 flex flex-wrap gap-x-4 text-[11px] text-muted-foreground">
        <span>المسؤول: {stage.assignee_name || "غير مُسند"}</span>
        <span>بدء: {fmtDateTime(stage.started_at)}</span>
        <span>انتهاء: {fmtDateTime(stage.completed_at)}</span>
        {stage.duration_minutes != null && <span>المدة: {fmtDuration(stage.duration_minutes)}</span>}
      </div>
      {stage.notes && <p className="mt-1.5 text-[12px] whitespace-pre-wrap">{stage.notes}</p>}
      {stage.review_status === "rejected" && stage.review_notes && (
        <p className="mt-1.5 text-[12px] text-late">سبب الرفض: {stage.review_notes}</p>
      )}
    </button>
  );
}

/** لوح تفاصيل المرحلة وإجراءاتها */
export function StageSheet({
  stage,
  onClose,
}: {
  stage: OrderStage | null;
  onClose: () => void;
}) {
  const { can, isManager, userId } = useCurrentAccount();
  const { data: profiles = [] } = useProfiles();
  const { data: templates = [] } = useStageTemplates();
  const actions = useStageActions();
  const upload = useUploadFiles(stage?.order_id ?? "");
  const { data: files = [] } = useOrderFiles(stage?.order_id ?? "");
  const stageFiles = files.filter((f) => f.stage_id === stage?.id);
  const urls = useSignedUrls(stageFiles.map((f) => f.storage_path));

  const [assignee, setAssignee] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [priority, setPriority] = useState<Priority>("normal");
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!stage) return;
    setAssignee(stage.assignee_id ?? "");
    setDueAt(stage.due_at ? stage.due_at.slice(0, 10) : "");
    setPriority(stage.priority);
    setNotes(stage.notes ?? "");
    setReason("");
  }, [stage]);

  if (!stage) return null;

  const canEdit = can("stages.edit");
  const mine = stage.assignee_id === userId;
  const eligible = profiles.filter(
    (p) =>
      p.is_active &&
      ((p.allowed_stages ?? []).length === 0 || (p.allowed_stages ?? []).includes(stage.stage)),
  );

  const wrap = async (p: Promise<unknown>, msg: string) => {
    try {
      await p;
      toast.success(msg);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر تنفيذ الإجراء");
    }
  };

  return (
    <Sheet open onClose={onClose} title={stageLabel(stage.stage)}>
      <div className="space-y-4 px-4 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <StageStatusChip status={stage.status} />
          <PriorityChip priority={stage.priority} />
          {stage.requires_review && <Chip tone="soon">تحتاج مراجعة</Chip>}
          {stage.rework_count > 0 && <Chip tone="late">إعادة عمل ×{stage.rework_count}</Chip>}
        </div>

        <dl className="rounded-lg border border-line text-[13px]">
          <Line label="المسؤول" value={stage.assignee_name || "غير مُسند"} />
          <Line label="تاريخ الإسناد" value={fmtDateTime(stage.assigned_at)} />
          <Line label="موعد الاستحقاق" value={fmtDateTime(stage.due_at)} />
          <Line label="بدء العمل" value={fmtDateTime(stage.started_at)} />
          <Line label="انتهاء العمل" value={fmtDateTime(stage.completed_at)} />
          <Line label="مدة التنفيذ" value={fmtDuration(stage.duration_minutes)} />
          {stage.delay_reason && <Line label="سبب التوقف" value={stage.delay_reason} />}
          {stage.review_notes && <Line label="ملاحظات المراجعة" value={stage.review_notes} />}
        </dl>

        {canEdit && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="الموظف المسؤول">
                <select className="field" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                  <option value="">بدون مسؤول</option>
                  {eligible.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="موعد إنجاز المرحلة">
                <input type="date" className="field" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
              </Field>
              <Field label="الأولوية">
                <select
                  className="field"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as Priority)}
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_LABEL[p]}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="flex items-end">
                <Btn
                  variant="quiet"
                  className="w-full"
                  onClick={() => {
                    const p = profiles.find((x) => x.id === assignee);
                    wrap(
                      actions.assign.mutateAsync({
                        stage,
                        assigneeId: p?.id ?? null,
                        assigneeName: p?.full_name ?? null,
                        dueAt: dueAt ? new Date(dueAt).toISOString() : null,
                        priority,
                        actorId: userId,
                      }),
                      "تم حفظ الإسناد",
                    );
                  }}
                >
                  حفظ الإسناد
                </Btn>
              </div>
            </div>

            <Field label="ملاحظات المرحلة">
              <textarea
                className="field min-h-20"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="ما تم إنجازه أو ما ينتظر الإنجاز"
              />
            </Field>
            <Btn
              variant="quiet"
              onClick={() => wrap(actions.saveStage.mutateAsync({ stage, patch: { notes } }), "تم حفظ الملاحظة")}
            >
              حفظ الملاحظة
            </Btn>

            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              {(mine || isManager) && stage.status !== "in_progress" && stage.status !== "done" && (
                <Btn onClick={() => wrap(actions.start.mutateAsync(stage), "بدأ العمل في المرحلة")}>
                  بدء العمل
                </Btn>
              )}
              {stage.status === "in_progress" && (
                <>
                  <Btn
                    variant="gold"
                    onClick={() =>
                      wrap(
                        actions.finish.mutateAsync(stage),
                        stage.requires_review ? "أُرسلت المرحلة للمراجعة" : "أُنجزت المرحلة",
                      )
                    }
                  >
                    {stage.requires_review ? "إنهاء وإرسال للمراجعة" : "إنهاء المرحلة"}
                  </Btn>
                  <Btn
                    variant="quiet"
                    className="text-late"
                    onClick={() =>
                      wrap(actions.pause.mutateAsync({ stage, reason: notes }), "تم إيقاف المرحلة")
                    }
                  >
                    إيقاف مؤقت
                  </Btn>
                </>
              )}
            </div>

            {isManager && stage.status === "review" && (
              <div className="space-y-2 rounded-lg border border-line p-3">
                <p className="text-[13px] font-medium">مراجعة المشرف</p>
                <input
                  className="field"
                  placeholder="سبب الرفض (عند الرفض)"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
                <div className="flex gap-2">
                  <Btn
                    variant="gold"
                    onClick={() =>
                      wrap(actions.approve.mutateAsync({ stage, actorId: userId }), "تم اعتماد المرحلة")
                    }
                  >
                    اعتماد
                  </Btn>
                  <Btn
                    variant="quiet"
                    className="text-late"
                    onClick={() => {
                      if (!reason.trim()) {
                        toast.error("اكتب سبب الرفض");
                        return;
                      }
                      wrap(
                        actions.reject.mutateAsync({ stage, reason, actorId: userId }),
                        "أُعيدت المرحلة للتنفيذ",
                      );
                    }}
                  >
                    رفض وإعادة العمل
                  </Btn>
                </div>
              </div>
            )}
          </>
        )}

        <div className="border-t border-line pt-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[13px] font-medium">ملفات المرحلة</p>
            {can("files.upload") && (
              <label className="cursor-pointer text-[13px] text-gold">
                إرفاق
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const list = Array.from(e.target.files ?? []);
                    if (list.length)
                      wrap(
                        upload.mutateAsync({ files: list, kind: "stage", stageId: stage.id }),
                        "تم إرفاق الملفات",
                      );
                    e.target.value = "";
                  }}
                />
              </label>
            )}
          </div>
          {stageFiles.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">لا توجد ملفات لهذه المرحلة.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {stageFiles.map((f) => (
                <a
                  key={f.id}
                  href={urls[f.storage_path]}
                  target="_blank"
                  rel="noreferrer"
                  className="aspect-square overflow-hidden rounded-lg border border-line bg-ivory"
                >
                  {urls[f.storage_path] && (
                    <img src={urls[f.storage_path]} alt="ملف المرحلة" className="size-full object-cover" />
                  )}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}

export function AssigneeBadge({ name, url }: { name?: string | null; url?: string | null }) {
  return (
    <span className="flex items-center gap-2 text-[12px] text-muted-foreground">
      <Avatar name={name} url={url} size={8} />
      {name || "غير مُسند"}
    </span>
  );
}

function Line({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line px-3 py-2 last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="max-w-[62%] text-left whitespace-pre-wrap">{value}</dd>
    </div>
  );
}
