import { Component, type ReactNode } from "react";

type Props = {
  /** 失敗時に表示する内容。reset を呼ぶと子を描画し直す（購読も開始し直される） */
  fallback: (error: unknown, reset: () => void) => ReactNode;
  children: ReactNode;
};

type State = { hasError: boolean; error: unknown };

/** 描画中に投げられたエラー（useLiveQuery の読み取り失敗など）を受け止める */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, error };
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  override render() {
    if (this.state.hasError) return this.props.fallback(this.state.error, this.reset);
    return this.props.children;
  }
}
