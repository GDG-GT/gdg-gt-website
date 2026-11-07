import "./assets";
import { useEffect, useMemo, useRef } from "react";
import { Excalidraw, MainMenu, restoreElements } from "@excalidraw/excalidraw";
import type {
  ExcalidrawInitialDataState,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";
import type { BoardDocument } from "./types";
import "@excalidraw/excalidraw/index.css";
import { observeDrawingControlNames } from "./drawing-control-names";

export default function BoardCanvas({
  document,
  onChange,
  onBaseline,
  fitRequest,
  readOnly,
}: {
  document: BoardDocument;
  onChange: (value: BoardDocument) => void;
  onBaseline: (value: BoardDocument) => void;
  fitRequest: number;
  readOnly: boolean;
}) {
  const interacted = useRef(false);
  const drawingRoot = useRef<HTMLDivElement>(null);
  const editor = useRef<ExcalidrawImperativeAPI>();
  useEffect(() => {
    if (drawingRoot.current) return observeDrawingControlNames(drawingRoot.current);
  }, []);
  useEffect(() => {
    if (!fitRequest) return;
    editor.current?.scrollToContent(undefined, {
      fitToViewport: true,
      animate: false,
      maxZoom: 1,
    });
  }, [fitRequest]);
  const initialData = useMemo(
    () => ({
      elements: restoreElements(
        document.elements as unknown as ExcalidrawInitialDataState["elements"],
        null,
      ),
      appState: { ...document.appState, currentItemFontFamily: 2 },
      scrollToContent: true,
    }),
    [document],
  );
  return (
    <div
      ref={drawingRoot}
      className="gt-board-canvas"
      onPointerDownCapture={() => {
        interacted.current = true;
      }}
      onKeyDownCapture={() => {
        interacted.current = true;
      }}
      onDropCapture={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <Excalidraw
        excalidrawAPI={(value) => {
          editor.current = value;
        }}
        initialData={initialData}
        theme="light"
        viewModeEnabled={readOnly}
        handleKeyboardGlobally={false}
        aiEnabled={false}
        validateEmbeddable={() => false}
        onChange={(elements, state) => {
          if (!readOnly)
            (interacted.current ? onChange : onBaseline)({
              elements: elements.map((e) => ({ ...e })),
              appState: { viewBackgroundColor: state.viewBackgroundColor },
            });
        }}
        UIOptions={{
          tools: { image: false },
          canvasActions: {
            loadScene: false,
            saveToActiveFile: false,
            export: false,
            saveAsImage: false,
            toggleTheme: false,
            changeViewBackgroundColor: false,
          },
        }}
      >
        <MainMenu>
          <MainMenu.Item onSelect={() => {}} disabled>
            Use the chapter toolbar to save or export
          </MainMenu.Item>
        </MainMenu>
      </Excalidraw>
    </div>
  );
}
