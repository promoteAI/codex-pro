import { useEffect, useState } from "react";
import { useShellStore } from "../stores/shell";

type Method = "ssh" | "wsl" | "docker";

const METHODS: Array<{ id: Method; name: string; sub: string; ico: string }> = [
  { id: "ssh", name: "SSH", sub: "远程主机", ico: '<rect x="4" y="4" width="16" height="6" rx="1.5"/><rect x="4" y="14" width="16" height="6" rx="1.5"/><path d="M7 7h.01M7 17h.01"/>' },
  { id: "wsl", name: "WSL", sub: "Windows Linux 子系统", ico: '<path d="M5 8h2l3 4-3 4H5l3-4zM12 16h7"/>' },
  { id: "docker", name: "Docker", sub: "本地容器", ico: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4"/><rect x="7" y="8" width="10" height="6" rx="1"/>' },
];

export function RemoteConnectModal() {
  const open = useShellStore((s) => s.remoteConnectOpen);
  const close = useShellStore((s) => s.closeRemoteConnect);
  const [step, setStep] = useState(1);
  const [method, setMethod] = useState<Method>("ssh");

  useEffect(() => {
    if (open) setStep(1);
  }, [open]);

  if (!open) return null;

  const stepTitle = (s: number) => ["选择连接方式", "填写配置", "连接中", "连接完成"][s - 1];
  const desc = (s: number) =>
    s === 1
      ? "选择进入当前工作区的连接方式，然后继续填写对应的连接配置。"
      : s === 2
        ? `填写 ${METHODS.find((m) => m.id === method)?.name} 连接信息。`
        : s === 3
          ? "正在建立连接，请稍候…"
          : "连接已建立，可以在设置中管理该连接。";

  const next = () => {
    if (step === 1) setStep(2);
    else if (step === 2) setStep(3);
    else if (step === 3) {
      // connection established
      setTimeout(() => setStep(4), 600);
    }
  };

  return (
    <div className="rc-overlay open" role="dialog" aria-modal="true" aria-labelledby="rcMainTitle">
      <div className="rc-wizard">
        <aside className="rc-side" aria-label="远程连接步骤">
          <p className="rc-side-title">远程连接</p>
          <div className="rc-steps" id="rcSteps">
            {[["1", "选择方式"], ["2", "填写配置"], ["3", "连接中"], ["4", "连接完成"]].map(([num, label]) => (
              <button key={num} type="button" className={`rc-step ${step >= Number(num) ? "is-active" : ""}`} disabled>
                <span className="rc-step-num">{num}</span>{label}
              </button>
            ))}
          </div>
        </aside>
        <div className="rc-main">
          <div className="rc-main-head">
            <h3 className="rc-main-title" id="rcMainTitle">{stepTitle(step)}</h3>
            <button type="button" className="rc-close" onClick={close} aria-label="关闭">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
            </button>
          </div>
          <p className="rc-main-desc" id="rcMainDesc">{desc(step)}</p>

          {step === 1 && (
            <div className="rc-pane is-active" data-pane="1">
              <div className="rc-method-grid" role="listbox" aria-label="连接方式">
                {METHODS.map((m) => (
                  <button key={m.id} type="button" role="option" aria-selected={method === m.id}
                    className={`rc-method ${method === m.id ? "is-selected" : ""}`} onClick={() => setMethod(m.id)}>
                    <span className="rc-method-ico" aria-hidden="true"><svg viewBox="0 0 24 24" dangerouslySetInnerHTML={{ __html: m.ico }} /></span>
                    <p className="rc-method-name">{m.name}</p>
                    <p className="rc-method-sub">{m.sub}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="rc-pane is-active" data-pane="2">
              <div className="rc-form is-active">
                {method === "ssh" ? (
                  <>
                    <div className="rc-field">
                      <label>主机</label>
                      <input type="text" placeholder="例如 10.0.0.12" defaultValue="10.102.32.16" autoComplete="off" />
                    </div>
                    <div className="rc-row">
                      <div className="rc-field">
                        <label>端口</label>
                        <input type="text" defaultValue="22" placeholder="22" autoComplete="off" />
                      </div>
                      <div className="rc-field">
                        <label>用户名</label>
                        <input type="text" defaultValue="root" placeholder="root" autoComplete="off" />
                      </div>
                    </div>
                    <div className="rc-field">
                      <label>认证方式</label>
                      <div className="rc-seg" role="group" aria-label="认证方式">
                        <button type="button" className="rc-seg-btn">密码</button>
                        <button type="button" className="rc-seg-btn is-active">私钥</button>
                      </div>
                    </div>
                  </>
                ) : method === "wsl" ? (
                  <div className="rc-field">
                    <label>WSL 发行版</label>
                    <select defaultValue="Ubuntu">
                      <option value="Ubuntu">Ubuntu</option>
                      <option value="Debian">Debian</option>
                      <option value="kali">Kali Linux</option>
                    </select>
                  </div>
                ) : (
                  <div className="rc-field">
                    <label>容器</label>
                    <input type="text" placeholder="容器名称或 ID" autoComplete="off" />
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="rc-pane is-active" data-pane="3" style={{ textAlign: "center", color: "#9a9a9a", paddingTop: 40 }}>
              正在连接…
            </div>
          )}

          {step === 4 && (
            <div className="rc-pane is-active" data-pane="4" style={{ textAlign: "center", color: "#6ecf9a", paddingTop: 40 }}>
              已连接到 {METHODS.find((m) => m.id === method)?.name}
            </div>
          )}

          <div className="rc-foot">
            {step > 1 && step < 4 ? (
              <button type="button" className="rc-btn rc-btn-cancel" onClick={() => setStep(step - 1)}>上一步</button>
            ) : step === 4 ? (
              <button type="button" className="rc-btn rc-btn-primary" onClick={close}>完成</button>
            ) : null}
            {step < 3 && (
              <button type="button" className="rc-btn rc-btn-primary" onClick={next}>
                {step === 1 ? "下一步" : "连接"}
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
