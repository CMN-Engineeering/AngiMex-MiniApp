import { useAtom, useAtomValue } from "jotai";
import { useState } from "react";
import { cartNoteState, cartState } from "@/state";
import CartItem from "./cart-item";
import Section from "@/components/section";
import { Icon, Modal } from "zmp-ui";
import HorizontalDivider from "@/components/horizontal-divider";

export default function CartList() {
  const cart = useAtomValue(cartState);
  const [note, setNote] = useAtom(cartNoteState);
  const [draftNote, setDraftNote] = useState(note);
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const now = new Date();
  const receivingDateStart = new Date(now);
  const receivingDateEnd = new Date(now);

  if (now.getHours() >= 16) {
    receivingDateStart.setDate(receivingDateStart.getDate() + 1);
  }
  receivingDateEnd.setDate(receivingDateEnd.getDate() + 2);

  const openNoteDialog = () => {
    setDraftNote(note);
    setNoteDialogOpen(true);
  };

  const closeNoteDialog = () => setNoteDialogOpen(false);

  const saveNote = () => {
    setNote(draftNote.slice(0, 100));
    closeNoteDialog();
  };

  return (
    <Section
      title={
        <div className="flex items-center space-x-2">
          <Icon icon="zi-calendar" />
          <div>
            <span className="font-normal text-sm">Thời gian nhận:</span>{" "}
            <span className="font-medium text-sm">
              {receivingDateStart.toLocaleDateString("vi-VN")} - {receivingDateEnd.toLocaleDateString("vi-VN")}
            </span>
          </div>
        </div>
      }
      className="flex-1 overflow-y-auto rounded-lg"
    >
      <div className="w-full">
        {cart.map((item) => (
          <CartItem key={item.product.id} {...item} />
        ))}
      </div>
      <HorizontalDivider />
      <button
        type="button"
        onClick={openNoteDialog}
        className="flex w-full items-center px-4 pt-3 pb-2 space-x-4 text-left"
      >
        <div className="text-sm font-medium">Ghi chú</div>
        <span
          className={`min-w-0 flex-1 truncate text-right text-sm ${
            note ? "text-foreground" : "text-inactive"
          }`}
        >
          {note || "Lưu ý cho người bán"}
        </span>
        <span>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" height="24px" width="24px" fill=""><path d="M12.6,12L8,7.4L9.4,6l6,6l-6,6L8,16.6L12.6,12Z"/></svg>
        </span>
      </button>
      <Modal
        visible={noteDialogOpen}
        title="Ghi chú"
        onClose={closeNoteDialog}
        actions={[
          { text: "Hủy", close: true, onClick: closeNoteDialog },
          {
            text: "Lưu",
            highLight: true,
            onClick: saveNote,
          },
        ]}
      >
        <textarea
          aria-label="Ghi chú cho người bán"
          placeholder="Lưu ý cho người bán"
          value={draftNote}
          maxLength={100}
          onChange={(event) => setDraftNote(event.target.value)}
          className="w-full resize-none rounded-lg border border-solid border-gray-300 p-3 text-sm focus:outline-none focus:border-primary"
          rows={4}
        />
        <div className="mt-1 text-right text-xs text-subtitle">
          {draftNote.length}/100
        </div>
      </Modal>
    </Section>
  );
}
