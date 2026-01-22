"use client";

import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Image, FileIcon, X, Upload, Loader2 } from "lucide-react";
import { formatFileSize } from "@/lib/utils";

interface FileUploadProps {
  conversationId: Id<"conversations">;
  onClose: () => void;
}

export function FileUpload({ conversationId, onClose }: FileUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const sendMessage = useMutation(api.messages.sendMessage);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      setSelectedFile(file);
      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onloadend = () => {
          setPreview(reader.result as string);
        };
        reader.readAsDataURL(file);
      } else {
        setPreview(null);
      }
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
  });

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    try {
      const uploadUrl = await generateUploadUrl();

      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": selectedFile.type },
        body: selectedFile,
      });

      const { storageId } = await result.json();

      const isImage = selectedFile.type.startsWith("image/");

      await sendMessage({
        conversationId,
        type: isImage ? "image" : "file",
        fileStorageId: storageId,
        fileName: selectedFile.name,
        fileSize: selectedFile.size,
        fileMimeType: selectedFile.type,
      });

      onClose();
    } catch (error) {
      console.error("Failed to upload file:", error);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="absolute bottom-full left-0 mb-2 w-72 bg-chat-header rounded-lg shadow-xl border border-chat-border overflow-hidden animate-scale-in">
      <div className="flex items-center justify-between p-3 border-b border-chat-border">
        <span className="text-sm font-medium text-chat-text-primary">
          Send File
        </span>
        <button
          onClick={onClose}
          className="p-1 hover:bg-chat-hover rounded"
        >
          <X className="w-4 h-4 text-chat-text-muted" />
        </button>
      </div>

      <div className="p-4">
        {selectedFile ? (
          <div className="space-y-3">
            {preview ? (
              <div className="relative aspect-video rounded-lg overflow-hidden bg-chat-input">
                <img
                  src={preview}
                  alt="Preview"
                  className="w-full h-full object-contain"
                />
              </div>
            ) : (
              <div className="flex items-center gap-3 p-3 bg-chat-input rounded-lg">
                <div className="w-10 h-10 bg-primary-600 rounded-lg flex items-center justify-center">
                  <FileIcon className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-chat-text-primary truncate">
                    {selectedFile.name}
                  </p>
                  <p className="text-xs text-chat-text-muted">
                    {formatFileSize(selectedFile.size)}
                  </p>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setSelectedFile(null);
                  setPreview(null);
                }}
                className="flex-1 py-2 text-sm text-chat-text-secondary hover:bg-chat-hover rounded-lg transition-colors"
              >
                Change
              </button>
              <button
                onClick={handleUpload}
                disabled={uploading}
                className="flex-1 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {uploading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    Send
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
              isDragActive
                ? "border-primary-500 bg-primary-500/10"
                : "border-chat-border hover:border-chat-text-muted"
            }`}
          >
            <input {...getInputProps()} />
            <div className="flex flex-col items-center gap-2">
              <div className="w-12 h-12 bg-chat-input rounded-full flex items-center justify-center">
                <Upload className="w-6 h-6 text-chat-text-muted" />
              </div>
              <p className="text-sm text-chat-text-primary">
                {isDragActive ? "Drop file here" : "Drag & drop or click"}
              </p>
              <p className="text-xs text-chat-text-muted">Max 10MB</p>
            </div>
          </div>
        )}
      </div>

      {!selectedFile && (
        <div className="px-4 pb-4 flex gap-2">
          <label className="flex-1 py-2 flex items-center justify-center gap-2 text-sm text-chat-text-secondary hover:bg-chat-hover rounded-lg cursor-pointer transition-colors">
            <Image className="w-4 h-4" />
            Photos
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onDrop([file]);
              }}
            />
          </label>
          <label className="flex-1 py-2 flex items-center justify-center gap-2 text-sm text-chat-text-secondary hover:bg-chat-hover rounded-lg cursor-pointer transition-colors">
            <FileIcon className="w-4 h-4" />
            Files
            <input
              type="file"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onDrop([file]);
              }}
            />
          </label>
        </div>
      )}
    </div>
  );
}