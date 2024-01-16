import { useContext, useState } from 'react'
import { Button } from "../button";
import FileUploader from "../file-uploader";
import { Input } from "../input";
import { ChatHandler } from "./chat.interface";
import { API_URL } from '@/app/utils/constants'
import { ChatIDContext } from '@/app/providers/ChatID'

export default function ChatInput(
  props: Pick<
    ChatHandler,
    | "isLoading"
    | "input"
    | "onFileUpload"
    | "onFileError"
    | "handleSubmit"
    | "handleInputChange"
  > & {
    multiModal?: boolean;
  },
) {
  const chatID = useContext(ChatIDContext)

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    props.handleSubmit(e);
  };

  const handleUploadFile = async (file: File) => {
    try {
      const response = await fetch(`${API_URL}/chats/${chatID}/upload_url`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error('Network response was not ok')
      }

      const data = await response.json()
      const uploadUrl = data.upload_url

      const formData = new FormData()
      formData.append('file', file)
      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        body: formData,
      })

      if (!uploadResponse.ok) {
        throw new Error('Network response was not ok')
      }
      props.onFileUpload?.(file);
    } catch (error: any) {
      console.error('There has been a problem with your fetch operation:', error.message);
      props.onFileError?.(error.message);
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-xl bg-white p-4 shadow-xl space-y-4"
    >
      <div className="flex w-full items-start justify-between gap-4 ">
        <Input
          autoFocus
          name="message"
          placeholder="Type a message"
          className="flex-1"
          value={props.input}
          onChange={props.handleInputChange}
        />
        <FileUploader
          onFileUpload={handleUploadFile}
          onFileError={props.onFileError}
        />
        <Button type="submit" disabled={props.isLoading}>
          Send message
        </Button>
      </div>
    </form>
  );
}
