export function CodeField() {
  return (
    <div className="cp-field">
      <label htmlFor="cp-code">6-digit code</label>
      <input
        id="cp-code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9 ]{6,7}"
        maxLength={7}
        required
        autoFocus
        className="cp-input cp-auth__code"
      />
    </div>
  )
}
