from __future__ import annotations

import asyncio
import logging
import re

import fitz  # PyMuPDF

logger = logging.getLogger(__name__)


class PDFPage:
    """Represents a single parsed PDF page."""

    def __init__(self, page_number: int, text: str) -> None:
        self.page_number = page_number
        self.text = text


class PDFParseResult:
    """Result of parsing an entire PDF document."""

    def __init__(self, filename: str, pages: list[PDFPage], total_pages: int) -> None:
        self.filename = filename
        self.pages = pages
        self.total_pages = total_pages

    @property
    def full_text(self) -> str:
        return "\n\n".join(page.text for page in self.pages if page.text.strip())


class PDFService:
    """Service for parsing PDF documents using PyMuPDF."""

    @staticmethod
    def _clean_text(text: str) -> str:
        """Collapse whitespace and normalize control characters."""
        text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text)
        text = re.sub(r" {2,}", " ", text)
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text.strip()

    @staticmethod
    def _validate_pdf_bytes(content: bytes) -> None:
        """Validate that content starts with PDF magic bytes."""
        if not content or len(content) < 5:
            raise ValueError("File content is empty or too small to be a valid PDF.")
        if not content[:5].startswith(b"%PDF"):
            raise ValueError("File does not appear to be a valid PDF (missing %PDF header).")

    def parse_pdf_sync(self, content: bytes, filename: str) -> PDFParseResult:
        """Parse PDF content synchronously. Call via asyncio.to_thread for async use."""
        self._validate_pdf_bytes(content)

        try:
            doc = fitz.open(stream=content, filetype="pdf")
        except RuntimeError as exc:
            logger.error("PyMuPDF failed to open PDF %s: %s", filename, exc)
            raise ValueError(f"Failed to open PDF file: {filename}") from exc

        if doc.page_count == 0:
            doc.close()
            raise ValueError(f"PDF file has no pages: {filename}")

        pages: list[PDFPage] = []
        for page_num in range(doc.page_count):
            page = doc[page_num]
            raw_text = page.get_text(sort=True)
            cleaned = self._clean_text(raw_text)
            if cleaned:
                pages.append(PDFPage(page_number=page_num + 1, text=cleaned))

        total_pages = doc.page_count
        doc.close()

        if not pages:
            raise ValueError(
                f"PDF file contains no extractable text: {filename}. "
                "The document may be scanned or image-only."
            )

        logger.info(
            "Parsed PDF %s: %d pages total, %d pages with text.",
            filename,
            total_pages,
            len(pages),
        )
        return PDFParseResult(filename=filename, pages=pages, total_pages=total_pages)

    async def parse_pdf(self, content: bytes, filename: str) -> PDFParseResult:
        """Parse PDF content asynchronously (offloads to thread pool)."""
        return await asyncio.to_thread(self.parse_pdf_sync, content, filename)
