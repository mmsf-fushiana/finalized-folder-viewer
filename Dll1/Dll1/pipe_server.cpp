#include "pch.h"
#include "pipe_server.h"
#include <cstdio>

PipeServer::~PipeServer() {
    Stop();
}

bool PipeServer::Start(const char* pipeName) {
    if (m_running.load()) return false;

    m_pipeName = pipeName;
    m_running = true;
    m_writeEvent = CreateEvent(NULL, TRUE, FALSE, NULL);
    m_serverThread = std::thread(&PipeServer::ServerThread, this);

    printf("[PipeServer] 開始: %s\n", pipeName);
    return true;
}

void PipeServer::Stop() {
    m_running = false;

    // パイプハンドルを閉じてブロック中の操作を解除
    if (m_hPipe != INVALID_HANDLE_VALUE) {
        CancelIoEx(m_hPipe, NULL);
        DisconnectNamedPipe(m_hPipe);
        CloseHandle(m_hPipe);
        m_hPipe = INVALID_HANDLE_VALUE;
    }

    if (m_serverThread.joinable()) {
        m_serverThread.detach();
    }
    if (m_readThread.joinable()) {
        m_readThread.detach();
    }
    if (m_writeEvent) {
        CloseHandle(m_writeEvent);
        m_writeEvent = NULL;
    }

    m_connected = false;
    printf("[PipeServer] 停止\n");
}

bool PipeServer::Send(const std::string& json) {
    if (!m_connected.load() || m_hPipe == INVALID_HANDLE_VALUE) return false;

    // LF区切りメッセージ
    std::string msg = json + "\n";

    std::lock_guard<std::mutex> lock(m_writeMutex);

    OVERLAPPED ol = {};
    ol.hEvent = m_writeEvent;
    ResetEvent(m_writeEvent);

    BOOL ok = WriteFile(m_hPipe, msg.c_str(), (DWORD)msg.size(), NULL, &ol);
    if (!ok && GetLastError() != ERROR_IO_PENDING) {
        printf("[PipeServer] Send失敗: %lu\n", GetLastError());
        return false;
    }

    DWORD written = 0;
    if (!GetOverlappedResult(m_hPipe, &ol, &written, TRUE)) {
        printf("[PipeServer] Send完了失敗: %lu\n", GetLastError());
        return false;
    }

    return true;
}

void PipeServer::ServerThread() {
    printf("[PipeServer] サーバースレッド開始\n");

    while (m_running.load()) {
        // パイプ作成
        m_hPipe = CreateNamedPipeA(
            m_pipeName.c_str(),
            PIPE_ACCESS_DUPLEX | FILE_FLAG_OVERLAPPED,
            PIPE_TYPE_BYTE | PIPE_READMODE_BYTE,
            1,      // max instances
            8192,   // out buffer
            4096,   // in buffer
            0, NULL
        );

        if (m_hPipe == INVALID_HANDLE_VALUE) {
            printf("[PipeServer] CreateNamedPipe失敗: %lu\n", GetLastError());
            Sleep(1000);
            continue;
        }

        printf("[PipeServer] クライアント接続待機中...\n");

        // Overlapped接続待ち
        OVERLAPPED olConnect = {};
        olConnect.hEvent = CreateEvent(NULL, TRUE, FALSE, NULL);
        ConnectNamedPipe(m_hPipe, &olConnect);
        DWORD lastErr = GetLastError();

        bool connected = false;
        if (lastErr == ERROR_PIPE_CONNECTED) {
            connected = true;
        } else if (lastErr == ERROR_IO_PENDING) {
            while (m_running.load()) {
                DWORD waitResult = WaitForSingleObject(olConnect.hEvent, 500);
                if (waitResult == WAIT_OBJECT_0) {
                    connected = true;
                    break;
                }
            }
        }
        CloseHandle(olConnect.hEvent);

        if (!connected) {
            CloseHandle(m_hPipe);
            m_hPipe = INVALID_HANDLE_VALUE;
            continue;
        }

        m_connected = true;
        printf("[PipeServer] クライアント接続!\n");

        if (OnConnect) OnConnect();

        // 読み取りスレッド開始
        m_readThread = std::thread(&PipeServer::ReadThread, this);

        // 読み取りスレッド終了まで待機（接続中はここでブロック）
        if (m_readThread.joinable()) {
            m_readThread.join();
        }

        // クライアント切断
        m_connected = false;
        printf("[PipeServer] クライアント切断\n");
        if (OnDisconnect) OnDisconnect();

        DisconnectNamedPipe(m_hPipe);
        CloseHandle(m_hPipe);
        m_hPipe = INVALID_HANDLE_VALUE;
    }

    printf("[PipeServer] サーバースレッド停止\n");
}

void PipeServer::ReadThread() {
    printf("[PipeServer] 読み取りスレッド開始\n");

    char buffer[4096];
    std::string lineBuffer;
    HANDLE readEvent = CreateEvent(NULL, TRUE, FALSE, NULL);

    while (m_running.load() && m_connected.load()) {
        OVERLAPPED ol = {};
        ol.hEvent = readEvent;
        ResetEvent(readEvent);

        DWORD bytesRead = 0;
        BOOL ok = ReadFile(m_hPipe, buffer, sizeof(buffer) - 1, &bytesRead, &ol);

        if (!ok) {
            DWORD err = GetLastError();
            if (err == ERROR_IO_PENDING) {
                // 読み取り待ち（500ms毎にg_runningチェック）
                while (m_running.load()) {
                    DWORD waitResult = WaitForSingleObject(readEvent, 500);
                    if (waitResult == WAIT_OBJECT_0) {
                        if (!GetOverlappedResult(m_hPipe, &ol, &bytesRead, FALSE)) {
                            goto disconnect;
                        }
                        break;
                    }
                }
                if (!m_running.load()) break;
            } else {
                // エラー（クライアント切断）
                goto disconnect;
            }
        }

        if (bytesRead > 0) {
            buffer[bytesRead] = '\0';
            lineBuffer += buffer;

            // LF区切りでメッセージ分割
            size_t pos;
            while ((pos = lineBuffer.find('\n')) != std::string::npos) {
                std::string message = lineBuffer.substr(0, pos);
                lineBuffer.erase(0, pos + 1);

                if (!message.empty() && OnMessage) {
                    OnMessage(message);
                }
            }
        }
    }

disconnect:
    CloseHandle(readEvent);
    m_connected = false;
    printf("[PipeServer] 読み取りスレッド停止\n");
}
