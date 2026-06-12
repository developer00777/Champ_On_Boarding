/* @ds-bundle: {"format":3,"namespace":"LakeB2BDesignSystem_daab95","components":[],"sourceHashes":{"ui_kits/website/Hero.jsx":"d50ffa5431b1","ui_kits/website/LeadForm.jsx":"9ade3cc69792","ui_kits/website/Primitives.jsx":"9e4cb097b878","ui_kits/website/QuoteBlock.jsx":"0bfa4605da79","ui_kits/website/SiteFooter.jsx":"7bfdb2905235","ui_kits/website/SiteHeader.jsx":"3bc431c32f7f","ui_kits/website/StatBand.jsx":"a85bcd79c2d7","ui_kits/website/VerticalGrid.jsx":"98ccfe3e46ab","ui_kits/website/v2/Hero.jsx":"2c854fe048b8","ui_kits/website/v2/LeadFooter.jsx":"15820187d131","ui_kits/website/v2/Primitives.jsx":"ad87cc71b507","ui_kits/website/v2/Quote.jsx":"613f9ab4f30b","ui_kits/website/v2/StatBand.jsx":"9a6114155e5a","ui_kits/website/v2/Tokens.jsx":"ae5fdb9bc8bc","ui_kits/website/v2/VerticalGrid.jsx":"899b8fc9c166"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.LakeB2BDesignSystem_daab95 = window.LakeB2BDesignSystem_daab95 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// ui_kits/website/Hero.jsx
try { (() => {
function Hero() {
  return /*#__PURE__*/React.createElement(Section, {
    pad: "120px 0 96px"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: -80,
      right: -100,
      width: 480,
      height: 480,
      borderRadius: '50%',
      background: 'radial-gradient(circle, rgba(221,18,134,.2), transparent 65%)',
      pointerEvents: 'none'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: -140,
      left: -120,
      width: 420,
      height: 420,
      borderRadius: '50%',
      background: 'radial-gradient(circle, rgba(109,8,190,.18), transparent 60%)',
      pointerEvents: 'none'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 820,
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement(Eyebrow, null, "The B2B growth stack"), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontFamily: 'Montserrat',
      fontWeight: 800,
      fontSize: 76,
      lineHeight: 1.02,
      letterSpacing: '-0.025em',
      margin: '18px 0 24px',
      color: '#0B0718',
      textWrap: 'balance'
    }
  }, "Turn deep data reservoirs into\xA0", /*#__PURE__*/React.createElement("span", {
    style: {
      background: 'linear-gradient(90deg,#FFB703 0%,#E8033A 50%,#6D08BE 100%)',
      WebkitBackgroundClip: 'text',
      backgroundClip: 'text',
      color: 'transparent'
    }
  }, "pipeline, campaigns, and talent.")), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: 'Montserrat',
      fontSize: 19,
      lineHeight: 1.55,
      color: '#3F355A',
      maxWidth: 640,
      margin: '0 0 36px',
      textWrap: 'pretty'
    }
  }, "One integrated platform across data intelligence, marketing technology, sales enablement, and talent, built on a single promise."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 12,
      alignItems: 'center',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "primary"
  }, "Book a demo \u2192"), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost"
  }, "Explore the stack"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: '#5C5470',
      marginLeft: 6
    }
  }, "Trusted by 4,000+ enterprise revenue teams"))));
}
Object.assign(window, {
  Hero
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/Hero.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/LeadForm.jsx
try { (() => {
const {
  useState: useStateLF
} = React;
function LeadForm() {
  const [state, setState] = useStateLF({
    name: '',
    email: '',
    company: '',
    size: '1,000 – 5,000',
    interest: 'SalesTech'
  });
  const [done, setDone] = useStateLF(false);
  const [err, setErr] = useStateLF('');
  const field = (k, v) => setState(s => ({
    ...s,
    [k]: v
  }));
  const submit = e => {
    e.preventDefault();
    if (!state.email.includes('@') || !state.name) {
      setErr('Please add your name and a work email.');
      return;
    }
    setErr('');
    setDone(true);
  };
  return /*#__PURE__*/React.createElement(Section, {
    id: "demo",
    bg: "linear-gradient(135deg,#6D08BE 0%,#DD1286 55%,#E8033A 100%)",
    pad: "96px 0"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 56,
      alignItems: 'center',
      color: '#fff'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Eyebrow, {
    color: "rgba(255,255,255,.85)"
  }, "Book a demo"), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: 'Montserrat',
      fontWeight: 800,
      fontSize: 48,
      lineHeight: 1.05,
      letterSpacing: '-0.02em',
      margin: '14px 0 18px'
    }
  }, "See the growth stack run against your accounts."), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: 'Montserrat',
      fontSize: 16,
      lineHeight: 1.55,
      maxWidth: 440,
      color: 'rgba(255,255,255,.88)',
      margin: 0
    }
  }, "30 minutes. One of our solutions architects will walk through data, campaigns, and ATS use-cases tied to your motion."), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 28,
      fontSize: 12,
      letterSpacing: '0.2em',
      textTransform: 'uppercase',
      fontWeight: 800,
      opacity: 0.85
    }
  }, "ENABLING GROWTH")), /*#__PURE__*/React.createElement("form", {
    onSubmit: submit,
    style: {
      background: '#fff',
      borderRadius: 20,
      padding: 28,
      boxShadow: '0 24px 60px rgba(11,7,24,.3)',
      color: '#0B0718'
    }
  }, done ? /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center',
      padding: '28px 8px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 56,
      height: 56,
      borderRadius: '50%',
      background: 'linear-gradient(135deg,#6D08BE,#DD1286)',
      margin: '0 auto 18px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#fff',
      fontSize: 28
    }
  }, "\u2713"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'Montserrat',
      fontWeight: 800,
      fontSize: 22
    }
  }, "You're booked."), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 14,
      color: '#3F355A',
      marginTop: 8
    }
  }, "We'll email ", state.email || 'you', " within 2 business hours to confirm."), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "sm",
    onClick: () => {
      setDone(false);
      setState({
        name: '',
        email: '',
        company: '',
        size: '1,000 – 5,000',
        interest: 'SalesTech'
      });
    }
  }, "Book another")) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Label, null, "Name"), /*#__PURE__*/React.createElement(Input, {
    value: state.name,
    onChange: v => field('name', v),
    placeholder: "Jane Doe"
  }), /*#__PURE__*/React.createElement(Label, null, "Work email"), /*#__PURE__*/React.createElement(Input, {
    value: state.email,
    onChange: v => field('email', v),
    placeholder: "jane@enterprise.com"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Label, null, "Company"), /*#__PURE__*/React.createElement(Input, {
    value: state.company,
    onChange: v => field('company', v),
    placeholder: "Meridian"
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Label, null, "Team size"), /*#__PURE__*/React.createElement(Select, {
    value: state.size,
    onChange: v => field('size', v),
    options: ['< 1,000', '1,000 – 5,000', '5,000 – 20,000', '20,000+']
  }))), /*#__PURE__*/React.createElement(Label, null, "Primary interest"), /*#__PURE__*/React.createElement(Select, {
    value: state.interest,
    onChange: v => field('interest', v),
    options: ['SalesTech', 'MarTech', 'RecruitTech', 'GrowthTech', 'All four']
  }), err && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 10,
      fontSize: 12,
      color: '#E8033A',
      fontWeight: 700
    }
  }, err), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 18
    }
  }, /*#__PURE__*/React.createElement(Button, {
    type: "submit",
    variant: "primary"
  }, "Book my demo \u2192")), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 12,
      fontSize: 11,
      color: '#5C5470'
    }
  }, "By submitting you agree to our privacy policy. We'll never share your email.")))));
}
function Label({
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      color: '#3F355A',
      margin: '14px 0 6px'
    }
  }, children);
}
function Input({
  value,
  onChange,
  placeholder
}) {
  return /*#__PURE__*/React.createElement("input", {
    value: value,
    onChange: e => onChange(e.target.value),
    placeholder: placeholder,
    style: {
      width: '100%',
      boxSizing: 'border-box',
      padding: '12px 14px',
      borderRadius: 12,
      border: '1.5px solid #D9D4E3',
      fontSize: 14,
      fontFamily: 'Montserrat',
      outline: 'none'
    },
    onFocus: e => {
      e.target.style.borderColor = '#6D08BE';
      e.target.style.boxShadow = '0 0 0 4px rgba(109,8,190,.25)';
    },
    onBlur: e => {
      e.target.style.borderColor = '#D9D4E3';
      e.target.style.boxShadow = 'none';
    }
  });
}
function Select({
  value,
  onChange,
  options
}) {
  return /*#__PURE__*/React.createElement("select", {
    value: value,
    onChange: e => onChange(e.target.value),
    style: {
      width: '100%',
      boxSizing: 'border-box',
      padding: '12px 14px',
      borderRadius: 12,
      border: '1.5px solid #D9D4E3',
      fontSize: 14,
      fontFamily: 'Montserrat',
      background: '#fff'
    }
  }, options.map(o => /*#__PURE__*/React.createElement("option", {
    key: o
  }, o)));
}
Object.assign(window, {
  LeadForm
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/LeadForm.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/Primitives.jsx
try { (() => {
const {
  useState
} = React;
function Button({
  variant = 'primary',
  size = 'md',
  children,
  onClick,
  type
}) {
  const base = {
    fontFamily: 'Montserrat, Arial, sans-serif',
    fontWeight: 700,
    letterSpacing: '0.04em',
    fontSize: size === 'sm' ? 12 : 14,
    padding: size === 'sm' ? '8px 14px' : '13px 24px',
    borderRadius: 999,
    border: 'none',
    cursor: 'pointer',
    transition: 'transform 180ms cubic-bezier(.22,.61,.36,1), box-shadow 180ms, background 180ms',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    textDecoration: 'none'
  };
  const variants = {
    primary: {
      background: '#E8033A',
      color: '#fff',
      boxShadow: '0 10px 28px -8px rgba(232,3,58,.55)'
    },
    secondary: {
      background: '#6D08BE',
      color: '#fff',
      boxShadow: '0 16px 48px -12px rgba(109,8,190,.45)'
    },
    gold: {
      background: '#FFB703',
      color: '#0B0718'
    },
    ghost: {
      background: 'transparent',
      color: '#6D08BE',
      border: '1.5px solid #6D08BE'
    },
    ghostLight: {
      background: 'transparent',
      color: '#fff',
      border: '1.5px solid rgba(255,255,255,.6)'
    },
    text: {
      background: 'transparent',
      color: '#6D08BE',
      padding: size === 'sm' ? '8px 2px' : '13px 2px'
    }
  };
  return /*#__PURE__*/React.createElement("button", {
    type: type,
    onClick: onClick,
    style: {
      ...base,
      ...variants[variant]
    },
    onMouseEnter: e => e.currentTarget.style.transform = 'translateY(-1px)',
    onMouseLeave: e => e.currentTarget.style.transform = 'translateY(0)'
  }, children);
}
function Eyebrow({
  color = '#6D08BE',
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'Montserrat, Arial, sans-serif',
      fontWeight: 700,
      fontSize: 13,
      letterSpacing: '0.18em',
      textTransform: 'uppercase',
      color
    }
  }, children);
}
function Section({
  children,
  bg = '#FFFFFF',
  pad = '96px 0',
  id
}) {
  return /*#__PURE__*/React.createElement("section", {
    id: id,
    style: {
      background: bg,
      padding: pad,
      position: 'relative',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 1180,
      margin: '0 auto',
      padding: '0 40px',
      position: 'relative'
    }
  }, children));
}
function Badge({
  children,
  tone = 'purple'
}) {
  const tones = {
    purple: {
      bg: 'rgba(109,8,190,.1)',
      fg: '#6D08BE'
    },
    gold: {
      bg: 'rgba(255,183,3,.18)',
      fg: '#7a5800'
    },
    red: {
      bg: 'rgba(232,3,58,.12)',
      fg: '#E8033A'
    },
    teal: {
      bg: 'rgba(0,149,160,.14)',
      fg: '#0095A0'
    }
  }[tone];
  return /*#__PURE__*/React.createElement("span", {
    style: {
      background: tones.bg,
      color: tones.fg,
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      padding: '5px 10px',
      borderRadius: 999
    }
  }, children);
}
Object.assign(window, {
  Button,
  Eyebrow,
  Section,
  Badge
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/Primitives.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/QuoteBlock.jsx
try { (() => {
function QuoteBlock() {
  return /*#__PURE__*/React.createElement(Section, {
    bg: "#FFFFFF",
    pad: "96px 0"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1.4fr',
      gap: 56,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      aspectRatio: '4/5',
      borderRadius: 24,
      background: 'linear-gradient(135deg,#011A6B,#6D08BE 70%,#DD1286)',
      position: 'relative',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      backgroundImage: 'radial-gradient(rgba(255,255,255,.25) 1px, transparent 1.5px)',
      backgroundSize: '16px 16px',
      mixBlendMode: 'overlay'
    }
  }), /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 200 250",
    style: {
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      mixBlendMode: 'screen',
      opacity: 0.55
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M-10 200 Q60 100 130 150 T 220 80",
    fill: "none",
    stroke: "rgba(255,255,255,.85)",
    strokeWidth: "2"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M-10 230 Q50 150 140 180 T 220 120",
    fill: "none",
    stroke: "rgba(255,255,255,.55)",
    strokeWidth: "1.5"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: 22,
      left: 22,
      right: 22,
      color: '#fff'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      letterSpacing: '0.2em',
      textTransform: 'uppercase',
      fontWeight: 700,
      opacity: 0.75
    }
  }, "Case study"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'Montserrat',
      fontWeight: 800,
      fontSize: 24,
      marginTop: 8,
      letterSpacing: '-0.01em'
    }
  }, "Healthcare network scales outbound by 3.1\xD7"))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Eyebrow, null, "Enterprise partnership"), /*#__PURE__*/React.createElement("blockquote", {
    style: {
      fontFamily: 'Alata, Georgia, serif',
      fontSize: 32,
      lineHeight: 1.3,
      color: '#0B0718',
      margin: '18px 0 28px',
      padding: '0 0 0 22px',
      borderLeft: '3px solid',
      borderImage: 'linear-gradient(180deg,#FFB703,#E8033A,#6D08BE) 1'
    }
  }, "Every enterprise sits on a lake of data. Most cannot use it. LakeB2B turned that depth into pipeline in one quarter."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 44,
      height: 44,
      borderRadius: '50%',
      background: 'linear-gradient(135deg,#FFB703,#E8033A,#6D08BE)'
    }
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'Montserrat',
      fontWeight: 700,
      fontSize: 14,
      color: '#0B0718'
    }
  }, "Priya Raman"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: '#5C5470'
    }
  }, "Chief Revenue Officer \xB7 Meridian Health Group"))))));
}
Object.assign(window, {
  QuoteBlock
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/QuoteBlock.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/SiteFooter.jsx
try { (() => {
function SiteFooter() {
  const cols = [{
    h: 'Stack',
    items: ['SalesTech', 'MarTech', 'RecruitTech', 'GrowthTech']
  }, {
    h: 'Data',
    items: ['Healthcare data', 'Industry data sets', 'Intent signals', 'Compliance']
  }, {
    h: 'Company',
    items: ['About', 'Careers', 'Partners', 'Press']
  }, {
    h: 'Resources',
    items: ['Case studies', 'Playbooks', 'Trust center', 'Contact']
  }];
  return /*#__PURE__*/React.createElement("footer", {
    style: {
      background: '#011A6B',
      color: '#fff',
      padding: '72px 0 32px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 1180,
      margin: '0 auto',
      padding: '0 40px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1.4fr repeat(4, 1fr)',
      gap: 40,
      paddingBottom: 48
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/lakeb2b-logo.png",
    alt: "LakeB2B",
    style: {
      height: 38,
      filter: 'brightness(0) invert(1)'
    }
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: 'Montserrat',
      fontSize: 13,
      lineHeight: 1.6,
      color: 'rgba(255,255,255,.7)',
      marginTop: 20,
      maxWidth: 300
    }
  }, "The B2B growth stack. Built on deep data reservoirs."), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 20,
      fontFamily: 'Montserrat',
      fontWeight: 800,
      fontSize: 13,
      letterSpacing: '0.22em',
      background: 'linear-gradient(90deg,#FFB703,#E8033A,#DD1286)',
      WebkitBackgroundClip: 'text',
      backgroundClip: 'text',
      color: 'transparent'
    }
  }, "ENABLING GROWTH")), cols.map(c => /*#__PURE__*/React.createElement("div", {
    key: c.h
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: '0.18em',
      textTransform: 'uppercase',
      color: '#FFB703',
      marginBottom: 16
    }
  }, c.h), /*#__PURE__*/React.createElement("ul", {
    style: {
      listStyle: 'none',
      padding: 0,
      margin: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }
  }, c.items.map(i => /*#__PURE__*/React.createElement("li", {
    key: i,
    style: {
      fontSize: 13,
      color: 'rgba(255,255,255,.78)',
      cursor: 'pointer'
    }
  }, i)))))), /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: '1px solid rgba(255,255,255,.12)',
      paddingTop: 22,
      display: 'flex',
      justifyContent: 'space-between',
      color: 'rgba(255,255,255,.5)',
      fontSize: 12
    }
  }, /*#__PURE__*/React.createElement("div", null, "\xA9 2026 LakeB2B. All rights reserved."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 20
    }
  }, /*#__PURE__*/React.createElement("span", null, "www.lakeb2b.com"), /*#__PURE__*/React.createElement("span", null, "info@lakeb2b.com"), /*#__PURE__*/React.createElement("span", null, "(888) 303-4466")))));
}
Object.assign(window, {
  SiteFooter
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/SiteFooter.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/SiteHeader.jsx
try { (() => {
const {
  useState: useStateHeader
} = React;
function SiteHeader({
  active,
  onNav
}) {
  const items = [{
    id: 'home',
    label: 'Home'
  }, {
    id: 'solutions',
    label: 'Solutions'
  }, {
    id: 'proof',
    label: 'Proof'
  }, {
    id: 'company',
    label: 'Company'
  }];
  return /*#__PURE__*/React.createElement("header", {
    style: {
      position: 'sticky',
      top: 0,
      zIndex: 40,
      background: 'rgba(255,255,255,0.82)',
      backdropFilter: 'saturate(180%) blur(16px)',
      WebkitBackdropFilter: 'saturate(180%) blur(16px)',
      borderBottom: '1px solid #ECE7F3'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 1180,
      margin: '0 auto',
      padding: '14px 40px',
      display: 'flex',
      alignItems: 'center',
      gap: 36
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/lakeb2b-logo.png",
    alt: "LakeB2B",
    style: {
      height: 34,
      cursor: 'pointer'
    },
    onClick: () => onNav('home')
  }), /*#__PURE__*/React.createElement("nav", {
    style: {
      display: 'flex',
      gap: 28,
      flex: 1
    }
  }, items.map(i => /*#__PURE__*/React.createElement("a", {
    key: i.id,
    onClick: () => onNav(i.id),
    style: {
      fontFamily: 'Montserrat',
      fontWeight: active === i.id ? 700 : 500,
      fontSize: 14,
      color: active === i.id ? '#6D08BE' : '#3F355A',
      textDecoration: 'none',
      cursor: 'pointer',
      padding: '6px 0',
      borderBottom: active === i.id ? '2px solid #6D08BE' : '2px solid transparent'
    }
  }, i.label))), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "sm"
  }, "Sign in"), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "sm"
  }, "Book a demo \u2192")));
}
Object.assign(window, {
  SiteHeader
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/SiteHeader.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/StatBand.jsx
try { (() => {
function StatBand() {
  const stats = [{
    k: '4,000+',
    v: 'Enterprise revenue teams'
  }, {
    k: '120M',
    v: 'Verified contact records'
  }, {
    k: '4×',
    v: 'Pipeline lift vs. point solutions'
  }, {
    k: '49',
    v: 'Industry-specific data sets'
  }];
  return /*#__PURE__*/React.createElement(Section, {
    id: "proof",
    bg: "#0B0718",
    pad: "80px 0"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4,1fr)',
      gap: 32
    }
  }, stats.map(s => /*#__PURE__*/React.createElement("div", {
    key: s.k
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'Montserrat',
      fontWeight: 800,
      fontSize: 60,
      lineHeight: 1,
      letterSpacing: '-0.04em',
      background: 'linear-gradient(90deg,#FFB703 0%,#E8033A 50%,#7A76DA 100%)',
      WebkitBackgroundClip: 'text',
      backgroundClip: 'text',
      color: 'transparent'
    }
  }, s.k), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'Montserrat',
      fontSize: 13,
      color: 'rgba(255,255,255,.7)',
      marginTop: 10,
      fontWeight: 500
    }
  }, s.v)))));
}
Object.assign(window, {
  StatBand
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/StatBand.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/VerticalGrid.jsx
try { (() => {
const {
  useState: useStateVG
} = React;
const VERTICALS = [{
  id: 'sales',
  name: 'SalesTech',
  tag: 'Unleashing Data-Driven Lead Generation',
  desc: 'SaaS + native Salesforce app. Healthcare and industry-specific data sets that identify and engage the accounts that drive pipeline.',
  bullets: ['Native Salesforce app', 'Contact + account data', 'Intent & firmographic signals'],
  gradient: 'linear-gradient(135deg,#6D08BE,#DD1286)'
}, {
  id: 'mar',
  name: 'MarTech',
  tag: 'Elevating Marketing Strategies with Data-Driven Insights',
  desc: 'Targeted data plus email, multi-channel campaigns, creative services, and marketing operations — all grounded in deep healthcare and industry data.',
  bullets: ['Email + multi-channel', 'Creative + MOPs services', 'Campaign data access'],
  gradient: 'linear-gradient(135deg,#E8033A,#FF6903)'
}, {
  id: 'rec',
  name: 'RecruitTech',
  tag: 'Revolutionizing Recruitment Processes',
  desc: 'Salesforce-native ATS, SMS / WhatsApp / email / call outreach, candidate data products, and parsers that pull profiles directly into Salesforce.',
  bullets: ['ATS on Salesforce', 'Outreach channels', 'Parsers + candidate data'],
  gradient: 'linear-gradient(135deg,#0095A0,#011A6B)'
}, {
  id: 'grow',
  name: 'GrowthTech',
  tag: 'Bespoke Solutions for CXOs',
  desc: 'Bespoke data solutions, offsite growth teams, white-label DaaS, IT support, and web + mobile development for CXOs driving enterprise growth.',
  bullets: ['White-label DaaS', 'Offsite growth teams', 'Web + mobile dev'],
  gradient: 'linear-gradient(135deg,#FFB703,#E8033A)'
}];
function VerticalGrid() {
  const [open, setOpen] = useStateVG('sales');
  return /*#__PURE__*/React.createElement(Section, {
    id: "solutions",
    bg: "#FBFAFD",
    pad: "96px 0"
  }, /*#__PURE__*/React.createElement(Eyebrow, null, "Four verticals \xB7 one stack"), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: 'Montserrat',
      fontWeight: 800,
      fontSize: 44,
      lineHeight: 1.1,
      letterSpacing: '-0.015em',
      margin: '14px 0 8px',
      color: '#0B0718'
    }
  }, "Integrated. Not a bag of point solutions."), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: 'Montserrat',
      fontSize: 16,
      color: '#3F355A',
      maxWidth: 620,
      margin: '0 0 40px'
    }
  }, "Each vertical runs on the same data foundation, so pipeline, campaigns, talent, and CXO strategy stay in sync."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: 16
    }
  }, VERTICALS.map(v => {
    const isOpen = open === v.id;
    return /*#__PURE__*/React.createElement("div", {
      key: v.id,
      onClick: () => setOpen(v.id),
      style: {
        borderRadius: 20,
        background: isOpen ? v.gradient : '#fff',
        border: isOpen ? 'none' : '1px solid #E6E1EE',
        padding: 24,
        color: isOpen ? '#fff' : '#0B0718',
        cursor: 'pointer',
        minHeight: 320,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        boxShadow: isOpen ? '0 24px 60px -12px rgba(109,8,190,.35)' : '0 1px 2px rgba(11,7,24,.04)',
        transition: 'all 280ms cubic-bezier(.22,.61,.36,1)',
        position: 'relative',
        overflow: 'hidden'
      }
    }, isOpen && /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'absolute',
        width: 160,
        height: 160,
        borderRadius: '50%',
        background: 'rgba(255,255,255,.18)',
        right: -40,
        top: -60,
        filter: 'blur(4px)'
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'Montserrat',
        fontWeight: 800,
        fontSize: 22,
        letterSpacing: '-0.01em',
        position: 'relative'
      }
    }, v.name), /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'Alata, Georgia, serif',
        fontSize: 14,
        lineHeight: 1.4,
        opacity: isOpen ? 0.95 : 0.85,
        color: isOpen ? '#fff' : '#3F355A',
        position: 'relative'
      }
    }, v.tag), isOpen && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 13,
        lineHeight: 1.55,
        opacity: 0.94,
        position: 'relative'
      }
    }, v.desc), /*#__PURE__*/React.createElement("ul", {
      style: {
        margin: 0,
        padding: 0,
        listStyle: 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        position: 'relative'
      }
    }, v.bullets.map(b => /*#__PURE__*/React.createElement("li", {
      key: b,
      style: {
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: '0.04em'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        marginRight: 8,
        opacity: 0.7
      }
    }, "\u25CF"), b))), /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: 'auto',
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        opacity: 0.9,
        position: 'relative'
      }
    }, "Learn more \u2192")), !isOpen && /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: 'auto',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: '#6D08BE'
      }
    }, "Click to expand"));
  })));
}
Object.assign(window, {
  VerticalGrid
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/VerticalGrid.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/v2/Hero.jsx
try { (() => {
function HeroV2({
  V
}) {
  const dark = V.label === 'Editorial Dark';
  return /*#__PURE__*/React.createElement(Sec, {
    id: "home",
    bg: V.heroBg,
    pad: "120px 0 96px"
  }, V.heroShow === 'orbs' && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: -80,
      right: -100,
      width: 480,
      height: 480,
      borderRadius: '50%',
      background: 'radial-gradient(circle, rgba(122,118,218,.22), transparent 65%)',
      pointerEvents: 'none'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: -140,
      left: -120,
      width: 420,
      height: 420,
      borderRadius: '50%',
      background: 'radial-gradient(circle, rgba(109,8,190,.18), transparent 60%)',
      pointerEvents: 'none'
    }
  })), V.heroShow === 'dots' && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      backgroundImage: 'radial-gradient(rgba(255,255,255,.18) 1px, transparent 1.5px)',
      backgroundSize: '22px 22px',
      mixBlendMode: 'overlay',
      pointerEvents: 'none'
    }
  }), /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 1200 500",
    preserveAspectRatio: "none",
    style: {
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      opacity: 0.6
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M-20 380 Q 300 180 620 260 T 1220 160",
    fill: "none",
    stroke: "rgba(255,255,255,.4)",
    strokeWidth: "1.5"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M-20 440 Q 260 260 640 320 T 1220 240",
    fill: "none",
    stroke: "rgba(255,255,255,.22)",
    strokeWidth: "1.2"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: -120,
      right: -80,
      width: 460,
      height: 460,
      borderRadius: '50%',
      background: 'radial-gradient(circle, rgba(255,183,3,.22), transparent 65%)',
      pointerEvents: 'none'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 820,
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement(Eye, {
    color: V.heroEyebrow
  }, "The B2B growth stack"), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontFamily: 'Montserrat',
      fontWeight: 800,
      fontSize: 76,
      lineHeight: 1.02,
      letterSpacing: '-0.025em',
      margin: '18px 0 24px',
      color: V.heroH1,
      textWrap: 'balance'
    }
  }, "Turn deep data reservoirs into\xA0", /*#__PURE__*/React.createElement("span", {
    style: {
      background: GRADIENTS.logo,
      WebkitBackgroundClip: 'text',
      backgroundClip: 'text',
      color: 'transparent'
    }
  }, "pipeline, campaigns, and talent.")), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: 'Montserrat',
      fontSize: 19,
      lineHeight: 1.55,
      color: V.heroBody,
      maxWidth: 640,
      margin: '0 0 36px',
      textWrap: 'pretty'
    }
  }, "One integrated platform across data intelligence, marketing technology, sales enablement, and talent. Built on a single promise."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 12,
      alignItems: 'center',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement(Btn, {
    variant: "primary"
  }, "Book a demo \u2192"), /*#__PURE__*/React.createElement(Btn, {
    variant: dark ? 'ghostLight' : 'ghost'
  }, "Explore the stack"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: V.heroProof,
      marginLeft: 6
    }
  }, "Trusted by 4,000+ enterprise revenue teams."))));
}
Object.assign(window, {
  HeroV2
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/v2/Hero.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/v2/LeadFooter.jsx
try { (() => {
const {
  useState: useStateLF2
} = React;
function LeadFormV2({
  V
}) {
  const [state, setState] = useStateLF2({
    name: '',
    email: '',
    company: '',
    size: '1,000 to 5,000',
    interest: 'SalesTech'
  });
  const [done, setDone] = useStateLF2(false);
  const [err, setErr] = useStateLF2('');
  const field = (k, v) => setState(s => ({
    ...s,
    [k]: v
  }));
  const submit = e => {
    e.preventDefault();
    if (!state.email.includes('@') || !state.name) {
      setErr('Please add your name and a work email.');
      return;
    }
    setErr('');
    setDone(true);
  };
  return /*#__PURE__*/React.createElement(Sec, {
    id: "demo",
    bg: V.ctaBg,
    pad: "96px 0"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none',
      backgroundImage: 'radial-gradient(rgba(255,255,255,.16) 1px, transparent 1.5px)',
      backgroundSize: '24px 24px',
      mixBlendMode: 'overlay'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 56,
      alignItems: 'center',
      color: '#fff'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Eye, {
    color: "rgba(255,255,255,.85)"
  }, "Book a demo"), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: 'Montserrat',
      fontWeight: 800,
      fontSize: 48,
      lineHeight: 1.05,
      letterSpacing: '-0.02em',
      margin: '14px 0 18px'
    }
  }, "See the growth stack run against your accounts."), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: 'Montserrat',
      fontSize: 16,
      lineHeight: 1.55,
      maxWidth: 440,
      color: 'rgba(255,255,255,.9)',
      margin: 0
    }
  }, "30 minutes. One of our solutions architects will walk through data, campaigns, and ATS use-cases tied to your motion."), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 28,
      fontSize: 12,
      letterSpacing: '0.2em',
      textTransform: 'uppercase',
      fontWeight: 800,
      opacity: 0.9
    }
  }, "ENABLING GROWTH")), /*#__PURE__*/React.createElement("form", {
    onSubmit: submit,
    style: {
      background: V.ctaCard,
      borderRadius: 20,
      padding: 28,
      boxShadow: '0 24px 60px rgba(11,7,24,.28)',
      color: '#0B0718'
    }
  }, done ? /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center',
      padding: '28px 8px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 56,
      height: 56,
      borderRadius: '50%',
      background: 'linear-gradient(135deg,#6D08BE,#E8033A)',
      margin: '0 auto 18px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#fff',
      fontSize: 28
    }
  }, "\u2713"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'Montserrat',
      fontWeight: 800,
      fontSize: 22
    }
  }, "You're booked."), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 14,
      color: '#3F355A',
      marginTop: 8
    }
  }, "We will email ", state.email || 'you', " within 2 business hours to confirm."), /*#__PURE__*/React.createElement(Btn, {
    variant: "ghost",
    size: "sm",
    onClick: () => {
      setDone(false);
      setState({
        name: '',
        email: '',
        company: '',
        size: '1,000 to 5,000',
        interest: 'SalesTech'
      });
    }
  }, "Book another")) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Lbl, null, "Name"), /*#__PURE__*/React.createElement(Inp, {
    value: state.name,
    onChange: v => field('name', v),
    placeholder: "Jane Doe"
  }), /*#__PURE__*/React.createElement(Lbl, null, "Work email"), /*#__PURE__*/React.createElement(Inp, {
    value: state.email,
    onChange: v => field('email', v),
    placeholder: "jane@enterprise.com"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Lbl, null, "Company"), /*#__PURE__*/React.createElement(Inp, {
    value: state.company,
    onChange: v => field('company', v),
    placeholder: "Meridian"
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Lbl, null, "Team size"), /*#__PURE__*/React.createElement(Sel, {
    value: state.size,
    onChange: v => field('size', v),
    options: ['< 1,000', '1,000 to 5,000', '5,000 to 20,000', '20,000+']
  }))), /*#__PURE__*/React.createElement(Lbl, null, "Primary interest"), /*#__PURE__*/React.createElement(Sel, {
    value: state.interest,
    onChange: v => field('interest', v),
    options: ['SalesTech', 'MarTech', 'RecruitTech', 'GrowthTech', 'All four']
  }), err && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 10,
      fontSize: 12,
      color: '#E8033A',
      fontWeight: 700
    }
  }, err), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 18
    }
  }, /*#__PURE__*/React.createElement(Btn, {
    type: "submit",
    variant: "primary"
  }, "Book my demo \u2192")), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 12,
      fontSize: 11,
      color: '#5C5470'
    }
  }, "By submitting you agree to our privacy policy. We will never share your email.")))));
}
function Lbl({
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      color: '#3F355A',
      margin: '14px 0 6px'
    }
  }, children);
}
function Inp({
  value,
  onChange,
  placeholder
}) {
  return /*#__PURE__*/React.createElement("input", {
    value: value,
    onChange: e => onChange(e.target.value),
    placeholder: placeholder,
    style: {
      width: '100%',
      boxSizing: 'border-box',
      padding: '12px 14px',
      borderRadius: 12,
      border: '1.5px solid #D9D4E3',
      fontSize: 14,
      fontFamily: 'Montserrat',
      outline: 'none'
    },
    onFocus: e => {
      e.target.style.borderColor = '#6D08BE';
      e.target.style.boxShadow = '0 0 0 4px rgba(109,8,190,.25)';
    },
    onBlur: e => {
      e.target.style.borderColor = '#D9D4E3';
      e.target.style.boxShadow = 'none';
    }
  });
}
function Sel({
  value,
  onChange,
  options
}) {
  return /*#__PURE__*/React.createElement("select", {
    value: value,
    onChange: e => onChange(e.target.value),
    style: {
      width: '100%',
      boxSizing: 'border-box',
      padding: '12px 14px',
      borderRadius: 12,
      border: '1.5px solid #D9D4E3',
      fontSize: 14,
      fontFamily: 'Montserrat',
      background: '#fff'
    }
  }, options.map(o => /*#__PURE__*/React.createElement("option", {
    key: o
  }, o)));
}
function FooterV2({
  V
}) {
  const cols = [{
    h: 'Stack',
    items: ['SalesTech', 'MarTech', 'RecruitTech', 'GrowthTech']
  }, {
    h: 'Data',
    items: ['Healthcare data', 'Industry data sets', 'Intent signals', 'Compliance']
  }, {
    h: 'Company',
    items: ['About', 'Careers', 'Partners', 'Press']
  }, {
    h: 'Resources',
    items: ['Case studies', 'Playbooks', 'Trust center', 'Contact']
  }];
  return /*#__PURE__*/React.createElement("footer", {
    style: {
      background: V.footerBg,
      color: '#fff',
      padding: '72px 0 32px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 1180,
      margin: '0 auto',
      padding: '0 40px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1.4fr repeat(4, 1fr)',
      gap: 40,
      paddingBottom: 48
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("img", {
    src: "../../../assets/lakeb2b-logo.png",
    alt: "LakeB2B",
    style: {
      height: 38,
      filter: 'brightness(0) invert(1)'
    }
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: 'Montserrat',
      fontSize: 13,
      lineHeight: 1.6,
      color: 'rgba(255,255,255,.7)',
      marginTop: 20,
      maxWidth: 300
    }
  }, "The B2B growth stack. Built on deep data reservoirs."), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 20,
      fontFamily: 'Montserrat',
      fontWeight: 800,
      fontSize: 13,
      letterSpacing: '0.22em',
      background: 'linear-gradient(90deg,#FFB703,#E8033A,#6D08BE)',
      WebkitBackgroundClip: 'text',
      backgroundClip: 'text',
      color: 'transparent'
    }
  }, "ENABLING GROWTH")), cols.map(c => /*#__PURE__*/React.createElement("div", {
    key: c.h
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: '0.18em',
      textTransform: 'uppercase',
      color: '#FFB703',
      marginBottom: 16
    }
  }, c.h), /*#__PURE__*/React.createElement("ul", {
    style: {
      listStyle: 'none',
      padding: 0,
      margin: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }
  }, c.items.map(i => /*#__PURE__*/React.createElement("li", {
    key: i,
    style: {
      fontSize: 13,
      color: 'rgba(255,255,255,.78)',
      cursor: 'pointer'
    }
  }, i)))))), /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: '1px solid rgba(255,255,255,.12)',
      paddingTop: 22,
      display: 'flex',
      justifyContent: 'space-between',
      color: 'rgba(255,255,255,.5)',
      fontSize: 12
    }
  }, /*#__PURE__*/React.createElement("div", null, "\xA9 2026 LakeB2B. All rights reserved."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 20
    }
  }, /*#__PURE__*/React.createElement("span", null, "www.lakeb2b.com"), /*#__PURE__*/React.createElement("span", null, "info@lakeb2b.com"), /*#__PURE__*/React.createElement("span", null, "(888) 303-4466")))));
}
Object.assign(window, {
  LeadFormV2,
  FooterV2
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/v2/LeadFooter.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/v2/Primitives.jsx
try { (() => {
/* Shared primitives — independent of variant */

function Btn({
  variant = 'primary',
  size = 'md',
  children,
  onClick,
  type
}) {
  const base = {
    fontFamily: 'Montserrat, Arial, sans-serif',
    fontWeight: 700,
    letterSpacing: '0.04em',
    fontSize: size === 'sm' ? 12 : 14,
    padding: size === 'sm' ? '8px 14px' : '13px 24px',
    borderRadius: 999,
    border: 'none',
    cursor: 'pointer',
    transition: 'transform 180ms cubic-bezier(.22,.61,.36,1), box-shadow 180ms, background 180ms',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    textDecoration: 'none'
  };
  const variants = {
    primary: {
      background: '#E8033A',
      color: '#fff',
      boxShadow: '0 10px 28px -8px rgba(232,3,58,.55)'
    },
    secondary: {
      background: '#6D08BE',
      color: '#fff',
      boxShadow: '0 16px 48px -12px rgba(109,8,190,.45)'
    },
    gold: {
      background: '#FFB703',
      color: '#0B0718'
    },
    ghost: {
      background: 'transparent',
      color: '#6D08BE',
      border: '1.5px solid #6D08BE'
    },
    ghostLight: {
      background: 'transparent',
      color: '#fff',
      border: '1.5px solid rgba(255,255,255,.6)'
    },
    text: {
      background: 'transparent',
      color: '#6D08BE',
      padding: size === 'sm' ? '8px 2px' : '13px 2px'
    }
  };
  return /*#__PURE__*/React.createElement("button", {
    type: type,
    onClick: onClick,
    style: {
      ...base,
      ...variants[variant]
    },
    onMouseEnter: e => e.currentTarget.style.transform = 'translateY(-1px)',
    onMouseLeave: e => e.currentTarget.style.transform = 'translateY(0)'
  }, children);
}
function Eye({
  color = '#6D08BE',
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'Montserrat, Arial, sans-serif',
      fontWeight: 700,
      fontSize: 13,
      letterSpacing: '0.18em',
      textTransform: 'uppercase',
      color
    }
  }, children);
}
function Sec({
  children,
  bg = '#FFFFFF',
  pad = '96px 0',
  id
}) {
  return /*#__PURE__*/React.createElement("section", {
    id: id,
    "data-screen-label": id,
    style: {
      background: bg,
      padding: pad,
      position: 'relative',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 1180,
      margin: '0 auto',
      padding: '0 40px',
      position: 'relative'
    }
  }, children));
}
function Header({
  active,
  onNav,
  variant
}) {
  const items = [{
    id: 'home',
    label: 'Home'
  }, {
    id: 'solutions',
    label: 'Solutions'
  }, {
    id: 'proof',
    label: 'Proof'
  }, {
    id: 'company',
    label: 'Company'
  }];
  const dark = variant === 'editorial';
  return /*#__PURE__*/React.createElement("header", {
    style: {
      position: 'sticky',
      top: 0,
      zIndex: 40,
      background: dark ? 'rgba(1,26,107,0.82)' : 'rgba(255,255,255,0.82)',
      backdropFilter: 'saturate(180%) blur(16px)',
      WebkitBackdropFilter: 'saturate(180%) blur(16px)',
      borderBottom: dark ? '1px solid rgba(255,255,255,.12)' : '1px solid #ECE7F3'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 1180,
      margin: '0 auto',
      padding: '14px 40px',
      display: 'flex',
      alignItems: 'center',
      gap: 36
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../../assets/lakeb2b-logo.png",
    alt: "LakeB2B",
    style: {
      height: 34,
      cursor: 'pointer',
      filter: dark ? 'brightness(0) invert(1)' : 'none'
    },
    onClick: () => onNav('home')
  }), /*#__PURE__*/React.createElement("nav", {
    style: {
      display: 'flex',
      gap: 28,
      flex: 1
    }
  }, items.map(i => {
    const activeColor = dark ? '#FFB703' : '#6D08BE';
    const idleColor = dark ? 'rgba(255,255,255,.78)' : '#3F355A';
    return /*#__PURE__*/React.createElement("a", {
      key: i.id,
      onClick: () => onNav(i.id),
      style: {
        fontFamily: 'Montserrat',
        fontWeight: active === i.id ? 700 : 500,
        fontSize: 14,
        color: active === i.id ? activeColor : idleColor,
        textDecoration: 'none',
        cursor: 'pointer',
        padding: '6px 0',
        borderBottom: active === i.id ? `2px solid ${activeColor}` : '2px solid transparent'
      }
    }, i.label);
  })), /*#__PURE__*/React.createElement(Btn, {
    variant: dark ? 'ghostLight' : 'ghost',
    size: "sm"
  }, "Sign in"), /*#__PURE__*/React.createElement(Btn, {
    variant: "primary",
    size: "sm"
  }, "Book a demo \u2192")));
}
Object.assign(window, {
  Btn,
  Eye,
  Sec,
  Header
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/v2/Primitives.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/v2/Quote.jsx
try { (() => {
function QuoteV2({
  V
}) {
  return /*#__PURE__*/React.createElement(Sec, {
    bg: V.quoteBg,
    pad: "96px 0"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1.4fr',
      gap: 56,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      aspectRatio: '4/5',
      borderRadius: 24,
      background: V.quoteImg,
      position: 'relative',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      backgroundImage: 'radial-gradient(rgba(255,255,255,.25) 1px, transparent 1.5px)',
      backgroundSize: '16px 16px',
      mixBlendMode: 'overlay'
    }
  }), /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 200 250",
    style: {
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      mixBlendMode: 'screen',
      opacity: 0.55
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M-10 200 Q60 100 130 150 T 220 80",
    fill: "none",
    stroke: "rgba(255,255,255,.85)",
    strokeWidth: "2"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M-10 230 Q50 150 140 180 T 220 120",
    fill: "none",
    stroke: "rgba(255,255,255,.55)",
    strokeWidth: "1.5"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: 22,
      left: 22,
      right: 22,
      color: '#fff'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      letterSpacing: '0.2em',
      textTransform: 'uppercase',
      fontWeight: 700,
      opacity: 0.78
    }
  }, "Case study"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'Montserrat',
      fontWeight: 800,
      fontSize: 24,
      marginTop: 8,
      letterSpacing: '-0.01em'
    }
  }, "Healthcare network scales outbound by 3.1\xD7."))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Eye, {
    color: "#6D08BE"
  }, "Enterprise partnership"), /*#__PURE__*/React.createElement("blockquote", {
    style: {
      fontFamily: 'Alata, Georgia, serif',
      fontSize: 32,
      lineHeight: 1.3,
      color: V.quoteText,
      margin: '18px 0 28px',
      padding: '0 0 0 22px',
      borderLeft: '3px solid',
      borderImage: 'linear-gradient(180deg,#FFB703,#E8033A,#6D08BE) 1'
    }
  }, "Every enterprise sits on a lake of data. Most cannot use it. LakeB2B turned that depth into pipeline in one quarter."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 44,
      height: 44,
      borderRadius: '50%',
      background: 'linear-gradient(135deg,#FFB703,#E8033A,#6D08BE)'
    }
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'Montserrat',
      fontWeight: 700,
      fontSize: 14,
      color: V.quoteText
    }
  }, "Priya Raman"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: '#5C5470'
    }
  }, "Chief Revenue Officer \xB7 Meridian Health Group"))))));
}
Object.assign(window, {
  QuoteV2
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/v2/Quote.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/v2/StatBand.jsx
try { (() => {
function StatBandV2({
  V
}) {
  const stats = [{
    k: '4,000+',
    v: 'Enterprise revenue teams'
  }, {
    k: '120M',
    v: 'Verified contact records'
  }, {
    k: '4×',
    v: 'Pipeline lift vs. point solutions'
  }, {
    k: '49',
    v: 'Industry-specific data sets'
  }];
  const numeralStyle = {
    fontFamily: 'Montserrat',
    fontWeight: 800,
    fontSize: 72,
    lineHeight: 1,
    letterSpacing: '-0.04em'
  };
  if (V.statBandNumeral === 'white-solid') {
    Object.assign(numeralStyle, {
      color: '#fff'
    });
  } else if (V.statBandNumeral === 'gold-red-purple') {
    Object.assign(numeralStyle, {
      background: 'linear-gradient(90deg,#FFB703 0%,#E8033A 50%,#FFFFFF 100%)',
      WebkitBackgroundClip: 'text',
      backgroundClip: 'text',
      color: 'transparent'
    });
  } else {
    Object.assign(numeralStyle, {
      background: V.statBandNumeral,
      WebkitBackgroundClip: 'text',
      backgroundClip: 'text',
      color: 'transparent'
    });
  }
  return /*#__PURE__*/React.createElement(Sec, {
    id: "proof",
    bg: V.statBandBg,
    pad: "88px 0"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none',
      backgroundImage: 'radial-gradient(rgba(255,255,255,.14) 1px, transparent 1.5px)',
      backgroundSize: '22px 22px',
      mixBlendMode: 'overlay'
    }
  }), /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 1200 220",
    preserveAspectRatio: "none",
    style: {
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      opacity: 0.6
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M-20 160 Q 280 60 600 120 T 1220 60",
    fill: "none",
    stroke: "rgba(255,255,255,.35)",
    strokeWidth: "1.2"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M-20 200 Q 320 100 640 150 T 1220 110",
    fill: "none",
    stroke: "rgba(255,255,255,.2)",
    strokeWidth: "1"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      display: 'grid',
      gridTemplateColumns: 'repeat(4,1fr)',
      gap: 32
    }
  }, stats.map(s => /*#__PURE__*/React.createElement("div", {
    key: s.k
  }, /*#__PURE__*/React.createElement("div", {
    style: numeralStyle
  }, s.k), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'Montserrat',
      fontSize: 13,
      color: V.statBandLabel,
      marginTop: 12,
      fontWeight: 500,
      letterSpacing: '0.02em'
    }
  }, s.v)))));
}
Object.assign(window, {
  StatBandV2
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/v2/StatBand.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/v2/Tokens.jsx
try { (() => {
/* Centralized palette + variant-specific surface recipes.
   Three variants: 'refined' | 'editorial' | 'gradient'.
   Each returns tokens the components read — no magenta, no bright-orange,
   no deep-red, no pure-black stat band.
*/

const PALETTE = {
  purple: '#6D08BE',
  lavender: '#7A76DA',
  red: '#E8033A',
  gold: '#FFB703',
  teal: '#0095A0',
  navy: '#011A6B',
  ink: '#0B0718',
  ink2: '#1E1433',
  fg: '#0B0718',
  fg2: '#3F355A',
  fg3: '#5C5470',
  smoke: '#9A93A8',
  fog: '#D9D4E3',
  mist: '#F3F0F7',
  paper: '#FBFAFD',
  lavenderTint: '#F6F2FC',
  lavenderTint2: '#EDE5FA',
  goldTint: '#FFF6DE',
  tealTint: '#E4F4F5',
  white: '#FFFFFF'
};

// Gradient library (tightened palette only)
const GRADIENTS = {
  logo: 'linear-gradient(90deg,#FFB703 0%,#E8033A 50%,#6D08BE 100%)',
  hero: 'linear-gradient(135deg,#6D08BE 0%,#7A76DA 55%,#E8033A 100%)',
  brand: 'linear-gradient(135deg,#6D08BE 0%,#E8033A 60%,#FFB703 100%)',
  data: 'linear-gradient(135deg,#011A6B 0%,#0095A0 55%,#6D08BE 100%)',
  tech: 'linear-gradient(135deg,#0095A0 0%,#6D08BE 100%)',
  cta: 'linear-gradient(135deg,#6D08BE 0%,#E8033A 100%)',
  ctaGold: 'linear-gradient(135deg,#6D08BE 0%,#E8033A 55%,#FFB703 100%)',
  soft: 'linear-gradient(180deg,#FBFAFD 0%,#F3F0F7 100%)',
  lavWash: 'linear-gradient(180deg,#F6F2FC 0%,#E7DFF6 100%)',
  navyDeep: 'linear-gradient(160deg,#011A6B 0%,#1E1433 60%,#6D08BE 100%)'
};

// Per-variant design recipes
function getVariant(name) {
  if (name === 'editorial') {
    return {
      label: 'Editorial Dark',
      page: PALETTE.paper,
      heroBg: GRADIENTS.navyDeep,
      heroEyebrow: 'rgba(255,255,255,.82)',
      heroH1: PALETTE.white,
      heroBody: 'rgba(255,255,255,.78)',
      heroProof: 'rgba(255,255,255,.65)',
      heroShow: 'dots',
      // pattern in hero
      verticalsBg: PALETTE.white,
      verticalsTitle: PALETTE.fg,
      verticalsBody: PALETTE.fg2,
      // Card surfaces when NOT open (no more flat white)
      cardTints: ['#F6F2FC',
      // lavender tint
      '#FFF6DE',
      // gold tint
      '#E4F4F5',
      // teal tint
      '#EDE5FA' // deeper lavender tint
      ],
      cardBorder: 'transparent',
      cardBorderHover: PALETTE.lavender,
      cardTextIdle: PALETTE.fg,
      cardTagIdle: PALETTE.fg2,
      cardCueIdle: PALETTE.purple,
      // Stat band — NOT black. Deep navy→purple gradient.
      statBandBg: GRADIENTS.navyDeep,
      statBandNumeral: GRADIENTS.brand,
      // gold→red→purple text gradient
      statBandLabel: 'rgba(255,255,255,.72)',
      quoteBg: PALETTE.mist,
      quoteImg: GRADIENTS.data,
      quoteText: PALETTE.fg,
      ctaBg: GRADIENTS.ctaGold,
      // purple→red→gold (no magenta)
      ctaCard: PALETTE.white,
      footerBg: PALETTE.navy
    };
  }
  if (name === 'gradient') {
    return {
      label: 'Gradient Forward',
      page: PALETTE.paper,
      heroBg: GRADIENTS.lavWash,
      heroEyebrow: PALETTE.purple,
      heroH1: PALETTE.fg,
      heroBody: PALETTE.fg2,
      heroProof: PALETTE.fg3,
      heroShow: 'orbs',
      verticalsBg: '#F9F6FD',
      verticalsTitle: PALETTE.fg,
      verticalsBody: PALETTE.fg2,
      // Each card gets its OWN soft tinted surface
      cardTints: ['#F3ECFB',
      // purple tint
      '#FFF1D6',
      // gold tint
      '#DFF0F2',
      // teal tint
      '#EDE5FA' // lavender tint
      ],
      cardBorder: 'transparent',
      cardBorderHover: PALETTE.purple,
      cardTextIdle: PALETTE.fg,
      cardTagIdle: PALETTE.fg2,
      cardCueIdle: PALETTE.purple,
      statBandBg: GRADIENTS.data,
      // navy→teal→purple
      statBandNumeral: 'white-solid',
      // solid white numerals on gradient
      statBandLabel: 'rgba(255,255,255,.78)',
      quoteBg: PALETTE.white,
      quoteImg: GRADIENTS.tech,
      quoteText: PALETTE.fg,
      ctaBg: GRADIENTS.tech,
      // teal→purple, no red/magenta clash
      ctaCard: PALETTE.white,
      footerBg: PALETTE.navy
    };
  }
  // 'refined' default
  return {
    label: 'Refined Light',
    page: PALETTE.white,
    heroBg: PALETTE.white,
    heroEyebrow: PALETTE.purple,
    heroH1: PALETTE.fg,
    heroBody: PALETTE.fg2,
    heroProof: PALETTE.fg3,
    heroShow: 'orbs',
    verticalsBg: PALETTE.mist,
    verticalsTitle: PALETTE.fg,
    verticalsBody: PALETTE.fg2,
    // Idle cards get a soft lavender mist (was flat white before)
    cardTints: ['#F6F2FC', '#F6F2FC', '#F6F2FC', '#F6F2FC'],
    cardBorder: '#E7DFF6',
    cardBorderHover: PALETTE.purple,
    cardTextIdle: PALETTE.fg,
    cardTagIdle: PALETTE.fg2,
    cardCueIdle: PALETTE.purple,
    // Stat band replaces the old black bar with a Navy→Purple→Teal gradient
    statBandBg: GRADIENTS.data,
    statBandNumeral: 'gold-red-purple',
    // gradient numerals
    statBandLabel: 'rgba(255,255,255,.78)',
    quoteBg: PALETTE.white,
    quoteImg: GRADIENTS.data,
    quoteText: PALETTE.fg,
    ctaBg: GRADIENTS.ctaGold,
    // purple→red→gold, no magenta clash
    ctaCard: PALETTE.white,
    footerBg: PALETTE.navy
  };
}
Object.assign(window, {
  PALETTE,
  GRADIENTS,
  getVariant
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/v2/Tokens.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/v2/VerticalGrid.jsx
try { (() => {
const {
  useState: useStateVG2
} = React;
const VERTICALS_V2 = [{
  id: 'sales',
  name: 'SalesTech',
  tag: 'Unleashing data-driven lead generation.',
  desc: 'SaaS and native Salesforce app. Healthcare and industry-specific data sets that identify and engage the accounts that drive pipeline.',
  bullets: ['Native Salesforce app', 'Contact + account data', 'Intent + firmographic signals'],
  gradient: 'linear-gradient(135deg,#6D08BE,#7A76DA)'
}, {
  id: 'mar',
  name: 'MarTech',
  tag: 'Elevating marketing strategies with data-driven insights.',
  desc: 'Targeted data plus email, multi-channel campaigns, creative services, and marketing operations. All grounded in deep healthcare and industry data.',
  bullets: ['Email + multi-channel', 'Creative + MOPs services', 'Campaign data access'],
  gradient: 'linear-gradient(135deg,#E8033A,#FFB703)'
}, {
  id: 'rec',
  name: 'RecruitTech',
  tag: 'Revolutionizing recruitment processes.',
  desc: 'Salesforce-native ATS. SMS, WhatsApp, email and call outreach. Candidate data products, and parsers that pull profiles directly into Salesforce.',
  bullets: ['ATS on Salesforce', 'Outreach channels', 'Parsers + candidate data'],
  gradient: 'linear-gradient(135deg,#0095A0,#011A6B)'
}, {
  id: 'grow',
  name: 'GrowthTech',
  tag: 'Bespoke solutions for CXOs.',
  desc: 'Bespoke data solutions, offsite growth teams, white-label DaaS, IT support, and web and mobile development for CXOs driving enterprise growth.',
  bullets: ['White-label DaaS', 'Offsite growth teams', 'Web + mobile dev'],
  gradient: 'linear-gradient(135deg,#6D08BE,#0095A0)'
}];
function VerticalGridV2({
  V
}) {
  const [open, setOpen] = useStateVG2('sales');
  const [hover, setHover] = useStateVG2(null);
  return /*#__PURE__*/React.createElement(Sec, {
    id: "solutions",
    bg: V.verticalsBg,
    pad: "96px 0"
  }, /*#__PURE__*/React.createElement(Eye, {
    color: V.cardCueIdle
  }, "Four verticals. One stack."), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: 'Montserrat',
      fontWeight: 800,
      fontSize: 44,
      lineHeight: 1.1,
      letterSpacing: '-0.015em',
      margin: '14px 0 8px',
      color: V.verticalsTitle
    }
  }, "Integrated. Not a bag of point solutions."), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: 'Montserrat',
      fontSize: 16,
      color: V.verticalsBody,
      maxWidth: 620,
      margin: '0 0 40px'
    }
  }, "Each vertical runs on the same data foundation, so pipeline, campaigns, talent, and CXO strategy stay in sync."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: 16
    }
  }, VERTICALS_V2.map((v, i) => {
    const isOpen = open === v.id;
    const isHover = hover === v.id && !isOpen;
    const idleBg = V.cardTints[i % V.cardTints.length];
    return /*#__PURE__*/React.createElement("div", {
      key: v.id,
      onClick: () => setOpen(v.id),
      onMouseEnter: () => setHover(v.id),
      onMouseLeave: () => setHover(null),
      style: {
        borderRadius: 20,
        background: isOpen ? v.gradient : idleBg,
        border: isOpen ? 'none' : `1.5px solid ${isHover ? V.cardBorderHover : V.cardBorder}`,
        padding: 24,
        color: isOpen ? '#fff' : V.cardTextIdle,
        cursor: 'pointer',
        minHeight: 320,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        boxShadow: isOpen ? '0 24px 60px -12px rgba(109,8,190,.35)' : isHover ? '0 18px 40px -16px rgba(109,8,190,.28)' : '0 1px 2px rgba(11,7,24,.04)',
        transform: isHover ? 'translateY(-3px)' : 'translateY(0)',
        transition: 'all 280ms cubic-bezier(.22,.61,.36,1)',
        position: 'relative',
        overflow: 'hidden'
      }
    }, isOpen && /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'absolute',
        width: 200,
        height: 200,
        borderRadius: '50%',
        background: 'rgba(255,255,255,.18)',
        right: -50,
        top: -70,
        filter: 'blur(6px)'
      }
    }), !isOpen && /*#__PURE__*/React.createElement("div", {
      "aria-hidden": true,
      style: {
        position: 'absolute',
        right: -30,
        top: -30,
        width: 140,
        height: 140,
        borderRadius: '50%',
        background: `radial-gradient(circle, rgba(109,8,190,${isHover ? 0.22 : 0.12}), transparent 65%)`,
        pointerEvents: 'none',
        transition: 'background 280ms'
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'Montserrat',
        fontWeight: 800,
        fontSize: 22,
        letterSpacing: '-0.01em',
        position: 'relative'
      }
    }, v.name), /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'Alata, Georgia, serif',
        fontSize: 14,
        lineHeight: 1.4,
        opacity: isOpen ? 0.95 : 0.92,
        color: isOpen ? '#fff' : V.cardTagIdle,
        position: 'relative'
      }
    }, v.tag), isOpen && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 13,
        lineHeight: 1.55,
        opacity: 0.94,
        position: 'relative'
      }
    }, v.desc), /*#__PURE__*/React.createElement("ul", {
      style: {
        margin: 0,
        padding: 0,
        listStyle: 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        position: 'relative'
      }
    }, v.bullets.map(b => /*#__PURE__*/React.createElement("li", {
      key: b,
      style: {
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: '0.04em'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        marginRight: 8,
        opacity: 0.75
      }
    }, "\u25CF"), b))), /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: 'auto',
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        opacity: 0.9,
        position: 'relative'
      }
    }, "Learn more \u2192")), !isOpen && /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: 'auto',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: V.cardCueIdle,
        position: 'relative'
      }
    }, isHover ? 'Click to expand →' : 'Click to expand'));
  })));
}
Object.assign(window, {
  VerticalGridV2
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/v2/VerticalGrid.jsx", error: String((e && e.message) || e) }); }

})();
