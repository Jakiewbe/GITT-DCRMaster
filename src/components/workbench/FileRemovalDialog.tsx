import { useEffect, useRef } from 'react';

export function FileRemovalDialog({ count, onCancel, onConfirm }: {
  count: number; onCancel: () => void; onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog ref={dialogRef} className="product-removal-dialog" aria-labelledby="file-removal-title"
      onCancel={(event) => { event.preventDefault(); onCancel(); }}>
      <h2 id="file-removal-title">从当前项目移除 {count} 个文件？</h2>
      <p>磁盘上的原始文件不会删除。对应的项目参数和分析缓存将一起移除。</p>
      <div className="product-file-management">
        <button className="product-button product-button--secondary" autoFocus onClick={onCancel}>取消</button>
        <button className="product-button product-button--primary" onClick={onConfirm}>确认移除</button>
      </div>
    </dialog>
  );
}
