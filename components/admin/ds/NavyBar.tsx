// Design system (B3): the navy section header bar — name left, an optional
// count or control right, white text. Extracted from the B2b board column
// header byte-for-byte. Chrome and emphasis are brand navy; never lime.

export default function NavyBar({
  label,
  right,
  rounded = 'lg',
}: {
  label: string
  right?: React.ReactNode
  // 'top' joins a body below it (the board column shape).
  rounded?: 'lg' | 'top'
}) {
  return (
    <div
      className={`flex items-center justify-between bg-navy px-3.5 py-2.5 text-white ${
        rounded === 'top' ? 'rounded-t-lg' : 'rounded-lg'
      }`}
    >
      <span className="font-heading text-[12.5px] font-semibold">{label}</span>
      {right !== undefined && (
        <span className="font-ui text-xs text-white/75 tabular-nums">{right}</span>
      )}
    </div>
  )
}
