#pragma once
// pipe_server.h : Named Pipe Server（双方向・メッセージ送受信）

#include <windows.h>
#include <string>
#include <thread>
#include <atomic>
#include <functional>
#include <mutex>

class PipeServer {
public:
    PipeServer() = default;
    ~PipeServer();

    // サーバー開始（別スレッドでパイプ待機）
    bool Start(const char* pipeName);

    // サーバー停止
    void Stop();

    // JSONメッセージ送信（LF区切り）
    bool Send(const std::string& json);

    // 接続状態
    bool IsConnected() const { return m_connected.load(); }

    // コールバック
    std::function<void(const std::string&)> OnMessage;  // メッセージ受信
    std::function<void()> OnConnect;                     // クライアント接続
    std::function<void()> OnDisconnect;                  // クライアント切断

private:
    void ServerThread();
    void ReadThread();

    std::string m_pipeName;
    HANDLE m_hPipe = INVALID_HANDLE_VALUE;
    std::thread m_serverThread;
    std::thread m_readThread;
    std::atomic<bool> m_running{ false };
    std::atomic<bool> m_connected{ false };
    std::mutex m_writeMutex;
    HANDLE m_writeEvent = NULL;
};
