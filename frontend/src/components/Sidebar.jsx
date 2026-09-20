import { NavLink } from 'react-router-dom';

const navItems = [
  { to: '/spx-gamma', label: 'Delta/Gamma Profiles' },
];

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="brand-block">
        <p className="brand-kicker">Options Positioning Terminal</p>
        <h1>Naive GEX Terminal</h1>
      </div>

      <nav className="sidebar-nav" aria-label="Primary">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
