/**
 * 로그인 화면.
 * 이메일/비밀번호를 서버로 보내 토큰을 받고, 관리자 웹 접근 권한이 있는 계정만 통과시킨다.
 * "로그인 유지"를 켜면 토큰을 localStorage에, 끄면 sessionStorage에 저장한다(auth.ts).
 */
import { useState } from "react";
import { Eye, EyeOff, ShieldCheck, Loader2 } from "lucide-react";
import { AuthError, AuthUser, canAccessAdmin, login } from "../auth";

interface LoginPageProps {
  onLogin: (user: AuthUser) => void;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  // 실제 운영 계정 주소를 번들에 담지 않기 위해 빈 값으로 시작한다
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [notice, setNotice] = useState("");

  // 제출: 빈 값 검사 → 로그인 요청 → 권한 확인 → 성공 시 상위(App)에 사용자 전달
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim();

    if (!trimmedEmail || !password) {
      setError("이메일과 비밀번호를 입력해 주세요.");
      return;
    }

    setError("");
    setNotice("");
    setLoading(true);

    try {
      const user = await login(trimmedEmail, password, rememberMe);

      if (!canAccessAdmin(user)) {
        setError("관리자 페이지에 접근할 권한이 없습니다.");
        return;
      }

      onLogin(user);
    } catch (error) {
      setError(error instanceof AuthError ? error.message : "로그인 처리 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{
        background: "linear-gradient(135deg, #0F172A 0%, #1E3A5F 50%, #0F172A 100%)",
      }}
    >
      <div
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      <div className="relative w-full max-w-sm mx-4">
        <div
          className="bg-white rounded-2xl shadow-2xl overflow-hidden"
          style={{ boxShadow: "0 24px 80px rgba(0,0,0,0.4)" }}
        >
          <div className="h-1 w-full" style={{ background: "linear-gradient(90deg, #3B82F6, #60A5FA)" }} />

          <div className="px-8 py-9">
            <div className="flex flex-col items-center mb-8">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
                style={{ background: "linear-gradient(135deg, #2563EB, #3B82F6)" }}
              >
                <ShieldCheck size={28} color="white" />
              </div>
              <h1 className="text-slate-900" style={{ fontSize: "20px", fontWeight: 800 }}>
                FireWatch Pro
              </h1>
              <p className="text-slate-400 mt-1" style={{ fontSize: "12px" }}>
                스마트 소화기 모니터링 시스템
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-slate-600 mb-1.5" style={{ fontSize: "12px", fontWeight: 600 }}>
                  이메일
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 outline-none transition-all focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
                  style={{ fontSize: "13px" }}
                  placeholder="admin@example.com"
                  autoComplete="email"
                />
              </div>

              <div>
                <label className="block text-slate-600 mb-1.5" style={{ fontSize: "12px", fontWeight: 600 }}>
                  비밀번호
                </label>
                <div className="relative">
                  <input
                    type={showPw ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 outline-none transition-all focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100 pr-10"
                    style={{ fontSize: "13px" }}
                    placeholder="비밀번호를 입력하세요"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    aria-label={showPw ? "비밀번호 숨기기" : "비밀번호 보기"}
                  >
                    {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {error && (
                <p className="text-red-500" style={{ fontSize: "12px" }}>
                  {error}
                </p>
              )}

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-3.5 h-3.5 rounded accent-blue-500"
                  />
                  <span className="text-slate-500" style={{ fontSize: "12px" }}>
                    로그인 유지
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() => setNotice("비밀번호 재설정은 서버의 계정 복구 API와 연결해야 합니다.")}
                  className="text-blue-500 hover:text-blue-600 transition-colors"
                  style={{ fontSize: "12px" }}
                >
                  비밀번호 찾기
                </button>
              </div>

              {notice && (
                <p className="text-blue-500" style={{ fontSize: "12px" }}>
                  {notice}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl text-white flex items-center justify-center gap-2 transition-all hover:opacity-90 active:scale-98"
                style={{
                  background: "linear-gradient(135deg, #2563EB, #3B82F6)",
                  fontSize: "14px",
                  fontWeight: 600,
                  opacity: loading ? 0.8 : 1,
                }}
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    인증 중
                  </>
                ) : (
                  "로그인"
                )}
              </button>
            </form>

            <p className="text-center text-slate-300 mt-5" style={{ fontSize: "11px" }}>
              등록된 관리자 계정으로만 접속할 수 있습니다.
            </p>
          </div>
        </div>

        <p className="text-center mt-5 text-slate-500" style={{ fontSize: "11px" }}>
          2026 FireWatch Pro. All rights reserved.
        </p>
      </div>
    </div>
  );
}
