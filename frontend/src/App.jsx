import React, { useState, useRef, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/TextLayer.css";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "./index.css";
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

function SignatureDialog(props) {
  const open = props.open;
  const onClose = props.onClose;
  const onSave = props.onSave;
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  useEffect(
    function () {
      if (!open) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 2;
    },
    [open]
  );

  function getPos(e) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  function handleDown(e) {
    if (!open) return;
    drawing.current = true;
    lastPos.current = getPos(e);
  }

  function handleMove(e) {
    if (!open) return;
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPos.current = pos;
  }

  function handleUp() {
    drawing.current = false;
  }

  function handleSave() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const data = canvas.toDataURL("image/png");
    onSave(data);
    onClose();
  }

  function handleClear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  if (!open) return null;

  return (
    <div className="modal-backdrop" onMouseUp={handleUp}>
      <div
        className="modal-panel"
        onMouseDown={function (e) {
          e.stopPropagation();
        }}
      >
        <div className="modal-header">Draw signature</div>
        <div className="canvas-frame">
          <canvas
            ref={canvasRef}
            width={380}
            height={140}
            onMouseDown={handleDown}
            onMouseMove={handleMove}
            onMouseUp={handleUp}
          />
        </div>
        <div className="modal-actions">
          <button className="button-main" onClick={handleClear}>
            Clear
          </button>
          <button className="button-main" onClick={onClose}>
            Cancel
          </button>
          <button className="button-main" onClick={handleSave}>
            Use
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [fields, setFields] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [pageBox, setPageBox] = useState({ width: 0, height: 0 });
  const [dragState, setDragState] = useState(null);
  const [resizeState, setResizeState] = useState(null);
  const [signatureData, setSignatureData] = useState("");
  const [showSignature, setShowSignature] = useState(false);
  const [signedUrl, setSignedUrl] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");
  const [pdfId, setPdfId] = useState("");
  const [fileToUpload, setFileToUpload] = useState(null);
  const [activeTool, setActiveTool] = useState("");
  const [sideDrag, setSideDrag] = useState(null);

  const layerRef = useRef(null);
  const wrapperRef = useRef(null);
  const imageInputRef = useRef(null);
  const [imageFieldId, setImageFieldId] = useState("");

  useEffect(function () {
    function measure() {
      const el = wrapperRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      setPageBox({ width: rect.width, height: rect.height });
    }
    measure();
    window.addEventListener("resize", measure);
    return function () {
      window.removeEventListener("resize", measure);
    };
  }, []);

  function handlePdfLoad() {
    const el = wrapperRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    setPageBox({ width: rect.width, height: rect.height });
  }

  function handleFileChange(e) {
    const files = e.target.files;
    if (!files || !files.length) return;
    setFileToUpload(files[0]);
  }

  function uploadPdf() {
    if (!fileToUpload) return;
    const fd = new FormData();
    fd.append('file', fileToUpload);
    fetch('http://localhost:5000/upload-pdf', {
      method: 'POST',
      body: fd
    })
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        if (data && data.url && data.pdfId) {
          setPdfUrl('http://localhost:5000' + data.url);
          setPdfId(data.pdfId);
          setFields([]);
          setSignatureData("");
          setSignedUrl("");
        }
      })
      .catch(function (err) {
        console.log('upload error', err);
      });
  }

  function startSideDrag(e, type) {
    e.preventDefault();
    setActiveTool(type);
    setSideDrag({ type: type, x: e.clientX, y: e.clientY });
  }

  function startDrag(e, field) {
    e.stopPropagation();
    if (!pageBox.width || !pageBox.height) return;
    setDragState({
      id: field.id,
      startX: e.clientX,
      startY: e.clientY,
      xPercent: field.xPercent,
      yPercent: field.yPercent,
    });
    setActiveId(field.id);
  }

  function startResize(e, field) {
    e.stopPropagation();
    if (!pageBox.width || !pageBox.height) return;
    setResizeState({
      id: field.id,
      startX: e.clientX,
      startY: e.clientY,
      widthPercent: field.widthPercent,
      heightPercent: field.heightPercent,
    });
    setActiveId(field.id);
  }

  function handleMouseMove(e) {
    if (sideDrag) {
      setSideDrag({ type: sideDrag.type, x: e.clientX, y: e.clientY });
      return;
    }
    const wrap = wrapperRef.current;
    const rect = wrap ? wrap.getBoundingClientRect() : null;
    const pw = rect ? rect.width : 0;
    const ph = rect ? rect.height : 0;

    if (dragState && pw && ph) {
      const dx = e.clientX - dragState.startX;
      const dy = e.clientY - dragState.startY;
      const dxPercent = (dx / pw) * 100;
      const dyPercent = (dy / ph) * 100;
      const id = dragState.id;
      setFields(function (list) {
        return list.map(function (f) {
          if (f.id !== id) return f;
          let nx = dragState.xPercent + dxPercent;
          let ny = dragState.yPercent + dyPercent;
          if (nx < 0) nx = 0;
          if (ny < 0) ny = 0;
          if (nx + f.widthPercent > 100) nx = 100 - f.widthPercent;
          if (ny + f.heightPercent > 100) ny = 100 - f.heightPercent;
          return Object.assign({}, f, { xPercent: nx, yPercent: ny });
        });
      });
    } else if (resizeState && pw && ph) {
      const dx = e.clientX - resizeState.startX;
      const dy = e.clientY - resizeState.startY;
      const dwPercent = (dx / pw) * 100;
      const dhPercent = (dy / ph) * 100;
      const id = resizeState.id;
      setFields(function (list) {
        return list.map(function (f) {
          if (f.id !== id) return f;
          let nw = resizeState.widthPercent + dwPercent;
          let nh = resizeState.heightPercent + dhPercent;
          if (nw < 3) nw = 3;
          if (nh < 3) nh = 3;
          if (f.xPercent + nw > 100) nw = 100 - f.xPercent;
          if (f.yPercent + nh > 100) nh = 100 - f.yPercent;
          return Object.assign({}, f, { widthPercent: nw, heightPercent: nh });
        });
      });
    }
  }

  function handleMouseUp(e) {
    if (sideDrag && e) {
      const layer = layerRef.current;
      if (layer) {
        const rect = layer.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        if (x >= 0 && y >= 0 && x <= rect.width && y <= rect.height) {
          const xPercent = (x / rect.width) * 100;
          const yPercent = (y / rect.height) * 100;
          let wPercent = 20;
          let hPercent = 6;
          if (sideDrag.type === 'radio') {
            wPercent = 5;
            hPercent = 5;
          }
          const id = Date.now().toString() + '-' + Math.random().toString(16).slice(2);
          const next = {
            id: id,
            type: sideDrag.type,
            page: 0,
            xPercent: xPercent,
            yPercent: yPercent,
            widthPercent: wPercent,
            heightPercent: hPercent
          };
          setFields(function (list) {
            return list.concat(next);
          });
          setActiveId(id);
        }
      }
      setSideDrag(null);
    }
    if (dragState) setDragState(null);
    if (resizeState) setResizeState(null);
  }

  function handleFieldDoubleClick(field) {
    if (field.type === "signature") {
      setShowSignature(true);
    } else if (field.type === "text") {
      const v = window.prompt("Text for this field", field.value || "");
      if (v !== null) {
        setFields(function (list) {
          return list.map(function (f) {
            if (f.id !== field.id) return f;
            return Object.assign({}, f, { value: v });
          });
        });
      }
    } else if (field.type === "radio") {
      setFields(function (list) {
        return list.map(function (f) {
          if (f.id !== field.id) return f;
          return Object.assign({}, f, { checked: !f.checked });
        });
      });
    } else if (field.type === "image") {
      if (imageInputRef.current) {
        setImageFieldId(field.id);
        imageInputRef.current.click();
      }
    }
  }

  function renderFieldContent(field) {
    if (field.type === "signature") {
      if (signatureData) {
        return (
          <img
            src={signatureData}
            alt="sign"
            style={{ maxWidth: "100%", maxHeight: "100%" }}
          />
        );
      }
      return "Signature";
    }
    if (field.type === "text") {
      return field.value || "Text";
    }
    if (field.type === "date") {
      return "Date";
    }
    if (field.type === "image") {
      if (field.imageData) {
        return (
          <img
            src={field.imageData}
            alt="img"
            style={{ maxWidth: "100%", maxHeight: "100%" }}
          />
        );
      }
      return "Image";
    }
    if (field.type === "radio") {
      return field.checked ? "●" : "○";
    }
    return "";
  }

  function signPdf() {
    if (!pdfId) {
      alert('Upload a PDF first.');
      return;
    }
    if (!fields.length) {
      alert('Place at least one field on the PDF.');
      return;
    }
    const payload = {
      pdfId: pdfId,
      base64Signature: signatureData || "",
      fields: fields.map(function (f) {
        return {
          type: f.type,
          page: f.page,
          xPercent: f.xPercent,
          yPercent: f.yPercent,
          widthPercent: f.widthPercent,
          heightPercent: f.heightPercent,
          value: f.value || "",
          checked: !!f.checked,
          imageData: f.imageData || ""
        };
      }),
    };
    fetch("http://localhost:5000/sign-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        if (data && data.error) {
          alert("Sign failed: " + data.error);
          return;
        }
        if (data && data.url) {
          const full = "http://localhost:5000" + data.url;
          setSignedUrl(full);
          alert('Signed PDF created. Use the link on the right to open it.');
        }
      })
      .catch(function (err) {
        console.log("sign error", err);
        alert('Sign failed. See console for details.');
      });
  }

  function handleSignatureSave(data) {
    setSignatureData(data);
  }

  function handleImageFile(e) {
    const files = e.target.files;
    if (!files || !files.length) return;
    const file = files[0];
    const reader = new FileReader();
    const targetId = imageFieldId;
    reader.onload = function (ev) {
      const result = ev.target && ev.target.result;
      if (typeof result === 'string' && targetId) {
        setFields(function (list) {
          return list.map(function (f) {
            if (f.id !== targetId) return f;
            return Object.assign({}, f, { imageData: result });
          });
        });
      }
    };
    reader.readAsDataURL(file);
    setImageFieldId("");
    e.target.value = "";
  }

  return (
    <div
      className="app-root"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      <div className="side-panel">
        <div className="side-title">Fields</div>
        <div
          className={"side-item" + (activeTool === "signature" ? " side-item-active" : "")}
          onMouseDown={function (e) {
            startSideDrag(e, 'signature');
          }}
        >
          Signature
        </div>
        <div
          className={"side-item" + (activeTool === "text" ? " side-item-active" : "")}
          onMouseDown={function (e) {
            startSideDrag(e, 'text');
          }}
        >
          Text
        </div>
        <div
          className={"side-item" + (activeTool === "date" ? " side-item-active" : "")}
          onMouseDown={function (e) {
            startSideDrag(e, 'date');
          }}
        >
          Date
        </div>
        <div
          className={"side-item" + (activeTool === "image" ? " side-item-active" : "")}
          onMouseDown={function (e) {
            startSideDrag(e, 'image');
          }}
        >
          Image
        </div>
        <div
          className={"side-item" + (activeTool === "radio" ? " side-item-active" : "")}
          onMouseDown={function (e) {
            startSideDrag(e, 'radio');
          }}
        >
          Radio
        </div>
      </div>
      <div className="editor-area">
        <div className="pdf-wrapper" ref={wrapperRef}>
          {pdfUrl ? (
            <Document file={pdfUrl} onLoadSuccess={handlePdfLoad}>
              <Page pageNumber={1} width={600} />
            </Document>
          ) : (
            <div style={{ padding: 24, fontSize: 13, color: '#666666' }}>
              Choose a PDF file and upload it to start.
            </div>
          )}
          <div
            ref={layerRef}
            className="field-layer"
          >
            {fields.map(function (f) {
              const style = {
                left: f.xPercent + '%',
                top: f.yPercent + '%',
                width: f.widthPercent + '%',
                height: f.heightPercent + '%',
              };
              const active = f.id === activeId;
              const cls = active ? "field-box active" : "field-box";
              return (
                <div
                  key={f.id}
                  className={cls}
                  style={style}
                  onMouseDown={function (e) {
                    startDrag(e, f);
                  }}
                  onDoubleClick={function () {
                    handleFieldDoubleClick(f);
                  }}
                >
                  {renderFieldContent(f)}
                  <div
                    className="resize-handle"
                    onMouseDown={function (e) {
                      startResize(e, f);
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>
        <div className="toolbar">
          <input
            type="file"
            accept="application/pdf"
            onChange={handleFileChange}
            style={{ fontSize: 12 }}
          />
          <button className="button-main" onClick={uploadPdf}>
            Upload PDF
          </button>
          <button
            className="button-main"
            onClick={function () {
              setShowSignature(true);
            }}
          >
            Draw signature
          </button>
          <button
            className="button-main"
            disabled={!fields.length || !pdfId}
            onClick={signPdf}
          >
            Sign PDF
          </button>
          {signedUrl ? (
            <div className="signed-link">
              <a href={signedUrl} target="_blank" rel="noreferrer">
                Open signed PDF
              </a>
            </div>
          ) : null}
        </div>
      </div>
      {sideDrag ? (
        <div
          style={{
            position: 'fixed',
            left: sideDrag.x - 30,
            top: sideDrag.y - 15,
            width: 60,
            height: 24,
            background: 'rgba(255,255,255,0.9)',
            border: '1px solid #999999',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            pointerEvents: 'none'
          }}
        >
          {sideDrag.type}
        </div>
      ) : null}
      <input
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/*"
        ref={imageInputRef}
        style={{ display: 'none' }}
        onChange={handleImageFile}
      />
      <SignatureDialog
        open={showSignature}
        onClose={function () {
          setShowSignature(false);
        }}
        onSave={handleSignatureSave}
      />
    </div>
  );
}
