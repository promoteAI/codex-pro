import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "../stores/toast";
import { useShellStore } from "../stores/shell";

type Method = "ssh" | "wsl" | "docker";

const METHODS: Array<{ id: Method; name: string; sub: string; ico: string }> = [
  { id: "ssh", name: "SSH", sub: "远程主机", ico: '<rect x="4" y="4" width="16" height="6" rx="1.5"/><rect x="4" y="14" width="16" height="6" rx="1.5"/><path d="M7 7h.01M7 17h.01"/>' },
  { id: "wsl", name: "WSL", sub: "Windows Linux 子系统", ico: '<path d="M5 8h2l3 4-3 4H5l3-4zM12 16h7"/>' },
  { id: "docker", name: "Docker", sub: "本地容器", ico: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4"/><rect x="7" y="8" width="10" height="6" rx="1"/>' },
];

export function RemoteConnectModal() {
  const { t } = useTranslation("modal");
  const open = useShellStore((s) => s.remoteConnectOpen);
  const close = useShellStore((s) => s.closeRemoteConnect);
  const [method, setMethod] = useState<Method>("ssh");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!open) return null;

  const connect = () => {
    toast.info(t("remoteConnect.unsupported"));
  };

  const methodSub = (id: Method) =>
    id === "ssh"
      ? t("remoteConnect.methodSshSub")
      : id === "wsl"
        ? t("remoteConnect.methodWslSub")
        : t("remoteConnect.methodDockerSub");

  return (
    <div className="rc-overlay open" role="dialog" aria-modal="true" aria-labelledby="rcMainTitle">
      <div className="rc-wizard">
        <aside className="rc-side" aria-label={t("remoteConnect.title")}>
          <p className="rc-side-title">{t("remoteConnect.title")}</p>
          <div className="rc-steps" id="rcSteps">
            {[
              ["1", t("remoteConnect.stepSelect")],
              ["2", t("remoteConnect.stepFill")],
              ["3", t("remoteConnect.stepConnecting")],
              ["4", t("remoteConnect.stepDone")],
            ].map(([num, label]) => (
              <button key={num} type="button" className="rc-step" disabled>
                <span className="rc-step-num">{num}</span>{label}
              </button>
            ))}
          </div>
        </aside>
        <div className="rc-main">
          <div className="rc-main-head">
            <h3 className="rc-main-title" id="rcMainTitle">{t("remoteConnect.stepSelect")}</h3>
            <button type="button" className="rc-close" onClick={close} aria-label={t("remoteConnect.stepSelect")}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
            </button>
          </div>
          <p className="rc-main-desc" id="rcMainDesc">{t("remoteConnect.selectDesc")}</p>

          <div className="rc-pane is-active" data-pane="1">
            <div className="rc-method-grid" role="listbox" aria-label={t("remoteConnect.title")}>
              {METHODS.map((m) => (
                <button key={m.id} type="button" role="option" aria-selected={method === m.id}
                  className={`rc-method ${method === m.id ? "is-selected" : ""}`} onClick={() => setMethod(m.id)}>
                  <span className="rc-method-ico" aria-hidden="true"><svg viewBox="0 0 24 24" dangerouslySetInnerHTML={{ __html: m.ico }} /></span>
                  <p className="rc-method-name">{m.name}</p>
                  <p className="rc-method-sub">{methodSub(m.id)}</p>
                </button>
              ))}
            </div>
            <div className="rc-pane is-active" data-pane="2" style={{ paddingTop: 8 }}>
              <div className="rc-form is-active">
                {method === "ssh" ? (
                  <>
                    <div className="rc-field">
                      <label>{t("remoteConnect.host")}</label>
                      <input type="text" placeholder={t("remoteConnect.hostPlaceholder")} autoComplete="off" />
                    </div>
                    <div className="rc-row">
                      <div className="rc-field">
                        <label>{t("remoteConnect.port")}</label>
                        <input type="text" placeholder="22" autoComplete="off" />
                      </div>
                      <div className="rc-field">
                        <label>{t("remoteConnect.user")}</label>
                        <input type="text" placeholder="root" autoComplete="off" />
                      </div>
                    </div>
                    <div className="rc-field">
                      <label>{t("remoteConnect.auth")}</label>
                      <div className="rc-seg" role="group" aria-label={t("remoteConnect.auth")}>
                        <button type="button" className="rc-seg-btn">{t("remoteConnect.password")}</button>
                        <button type="button" className="rc-seg-btn is-active">{t("remoteConnect.privateKey")}</button>
                      </div>
                    </div>
                  </>
                ) : method === "wsl" ? (
                  <div className="rc-field">
                    <label>{t("remoteConnect.wslDistro")}</label>
                    <select defaultValue="Ubuntu">
                      <option value="Ubuntu">Ubuntu</option>
                      <option value="Debian">Debian</option>
                      <option value="kali">Kali Linux</option>
                    </select>
                  </div>
                ) : (
                  <div className="rc-field">
                    <label>{t("remoteConnect.container")}</label>
                    <input type="text" placeholder={t("remoteConnect.containerPlaceholder")} autoComplete="off" />
                  </div>
                )}
              </div>
              <p style={{ marginTop: 16, fontSize: 12.5, color: "#8a8a8a" }}>
                {t("remoteConnect.unsupported")}
              </p>
            </div>
          </div>

          <div className="rc-foot">
            <button type="button" className="rc-btn rc-btn-primary" onClick={connect}>
              {t("remoteConnect.connect")}
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
