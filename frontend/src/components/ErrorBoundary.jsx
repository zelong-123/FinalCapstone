import React from 'react';
import { FaArrowRotateRight, FaTriangleExclamation } from 'react-icons/fa6';
import AppIconImg from '../assets/icon.png.png';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('Herald UI error:', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="fatal-screen">
        <section className="fatal-card" role="alert">
          <img src={AppIconImg} alt="" />
          <span className="fatal-icon"><FaTriangleExclamation /></span>
          <p className="page-eyebrow">Protected recovery</p>
          <h1>Herald could not display this screen.</h1>
          <p>Your session and data are safe. Reload the workspace to recover from the interface error.</p>
          <button type="button" className="primary-button" onClick={() => window.location.reload()}>
            <FaArrowRotateRight /> Reload workspace
          </button>
        </section>
      </main>
    );
  }
}
