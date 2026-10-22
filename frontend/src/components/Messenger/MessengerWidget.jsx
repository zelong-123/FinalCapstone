import React, { useEffect, useRef, useState } from 'react';
import {
  FaArrowLeft,
  FaBoxesStacked,
  FaBuilding,
  FaBullhorn,
  FaCheck,
  FaCheckDouble,
  FaCircle,
  FaCommentDots,
  FaComments,
  FaFaceSmile,
  FaHandshake,
  FaMagnifyingGlass,
  FaMinus,
  FaPaperPlane,
  FaStore,
  FaUser,
  FaUsers,
  FaUserShield,
  FaXmark,
} from 'react-icons/fa6';
import { useAuth } from '../../context/AuthContext';
import { useChat } from '../../context/ChatContext';
import './messenger.css';

const QUICK_REACTIONS = ['👍', '❤️', '👏', '🎉', '🚀', '📦', '💡', '🔥'];

export function getDeptMeta(department, type = 'department') {
  if (type === 'direct') {
    return { icon: FaUser, className: 'dept-general', label: 'Direct Message' };
  }
  switch (department) {
    case 'admin':
      return { icon: FaUserShield, className: 'dept-admin', label: 'Administration' };
    case 'marketing':
      return { icon: FaBullhorn, className: 'dept-marketing', label: 'Marketing' };
    case 'sales':
      return { icon: FaHandshake, className: 'dept-sales', label: 'Sales' };
    case 'logistics':
      return { icon: FaBoxesStacked, className: 'dept-logistics', label: 'Logistics' };
    case 'franchisee':
      return { icon: FaStore, className: 'dept-franchisee', label: 'Franchisee' };
    default:
      return { icon: FaBuilding, className: 'dept-general', label: 'All Departments' };
  }
}

export function formatMessageTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatDateGroup(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function getInitials(name = 'User') {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'U'
  );
}

export default function MessengerWidget() {
  const { user } = useAuth();

  const {
    channels,
    activeChannel,
    messages,
    unreadTotal,
    isOpen,
    isMinimized,
    sendingMessage,
    directory,
    setIsOpen,
    setIsMinimized,
    selectChannel,
    sendMessage,
    startDirectChat,
    toggleMessenger,
  } = useChat();

  const [activeTab, setActiveTab] = useState('chats'); // 'chats' | 'directory'
  const [inputText, setInputText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [inThreadView, setInThreadView] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll when messages update
  useEffect(() => {
    if (inThreadView && isOpen && !isMinimized) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, inThreadView, isOpen, isMinimized]);

  // Focus input when thread opens
  useEffect(() => {
    if (inThreadView && isOpen && !isMinimized) {
      const timer = window.setTimeout(() => inputRef.current?.focus(), 150);
      return () => window.clearTimeout(timer);
    }
  }, [inThreadView, isOpen, isMinimized, activeChannel?.id]);

  const handleSend = async (e) => {
    e?.preventDefault();
    if (!inputText.trim() || sendingMessage) return;
    const text = inputText;
    setInputText('');
    try {
      await sendMessage(text);
    } catch {
      setInputText(text);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const handleAddReaction = (emoji) => {
    setInputText((prev) => (prev ? `${prev} ${emoji}` : emoji));
    inputRef.current?.focus();
  };

  const handleOpenChannel = (chanId) => {
    selectChannel(chanId);
    setInThreadView(true);
  };

  const handleStartDirect = async (recipientId) => {
    await startDirectChat(recipientId);
    setInThreadView(true);
  };

  // Filter channels
  const filteredChannels = channels.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (c.department && c.department.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Filter directory
  const filteredDirectory = directory.filter((u) =>
    u.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (u.department && u.department.toLowerCase().includes(searchQuery.toLowerCase())) ||
    u.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      {/* Floating Messenger Launcher Button */}
   

      {/* Floating Messenger Window */}
      {isOpen && (
        <aside
          className={`messenger-window${isMinimized ? ' minimized' : ''}`}
          aria-label="Team Live Messenger"
        >
          {/* Header */}
          <div className="messenger-header">
            <div className="messenger-header-left">
              {inThreadView ? (
                <>
                  <button
                    type="button"
                    className="messenger-back-btn"
                    onClick={() => setInThreadView(false)}
                    title="Back to conversations"
                  >
                    <FaArrowLeft />
                  </button>
                  <div className={`messenger-avatar ${activeChannel?.is_online ? 'online' : ''}`}>
                    {getInitials(activeChannel?.name)}
                  </div>
                  <div className="messenger-title-wrap">
                    <div className="messenger-title">
                      {activeChannel?.name || 'Department Chat'}
                    </div>
                    <div className="messenger-status-pill">
                      <span className="pulse-dot" />
                      {activeChannel?.type === 'direct'
                        ? (activeChannel?.is_online ? 'Active now' : 'Colleague')
                        : 'Real-time Live'}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="messenger-avatar">
                    <FaComments />
                  </div>
                  <div className="messenger-title-wrap">
                    <div className="messenger-title">Franchise Messenger</div>
                    <div className="messenger-status-pill">
                      <span className="pulse-dot" />
                      Live Network Connected
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="messenger-header-actions">
              <button
                type="button"
                className="header-action-btn"
                onClick={() => setIsMinimized((prev) => !prev)}
                title={isMinimized ? 'Restore' : 'Minimize'}
              >
                <FaMinus />
              </button>
              <button
                type="button"
                className="header-action-btn"
                onClick={() => setIsOpen(false)}
                title="Close Messenger"
              >
                <FaXmark />
              </button>
            </div>
          </div>

          {!isMinimized && (
            <>
              {inThreadView ? (
                /* Thread Message View */
                <div className="messenger-chat-view">
                  <div className="messenger-messages-container">
                    {messages.length === 0 ? (
                      <div style={{ textAlign: 'center', color: 'var(--muted)', margin: 'auto', padding: '24px' }}>
                        <FaComments style={{ fontSize: '32px', marginBottom: '8px', opacity: 0.5 }} />
                        <p style={{ margin: 0, fontSize: '13px' }}>No messages in this channel yet.</p>
                        <p style={{ margin: '4px 0 0', fontSize: '11px' }}>Be the first to say hello!</p>
                      </div>
                    ) : (
                      messages.map((msg, index) => {
                        const isMe = msg.user_id === user?.id;
                        const prevMsg = messages[index - 1];
                        const showDate =
                          !prevMsg ||
                          new Date(msg.created_at).toDateString() !==
                            new Date(prevMsg.created_at).toDateString();

                        return (
                          <React.Fragment key={msg.id || index}>
                            {showDate && (
                              <div className="date-divider">
                                <span>{formatDateGroup(msg.created_at)}</span>
                              </div>
                            )}
                            <div className={`message-bubble-row ${isMe ? 'sent-me' : 'sent-them'}`}>
                              {!isMe && (
                                <div className="bubble-avatar">
                                  {getInitials(msg.user?.full_name)}
                                </div>
                              )}
                              <div className="bubble-content">
                                {!isMe && (
                                  <div className="bubble-sender-name">
                                    <span>{msg.user?.full_name || 'Team Member'}</span>
                                    {msg.user?.role?.label && (
                                      <span className="bubble-role-pill">
                                        {msg.user.role.label}
                                      </span>
                                    )}
                                  </div>
                                )}
                                <div className="bubble-box">
                                  {msg.message}
                                  <div className="bubble-footer">
                                    <span>{formatMessageTime(msg.created_at)}</span>
                                    {isMe && (
                                      msg._optimistic ? (
                                        <span style={{ opacity: 0.6 }}>•</span>
                                      ) : (
                                        <FaCheckDouble style={{ fontSize: '9px' }} />
                                      )
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </React.Fragment>
                        );
                      })
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Quick Reactions */}
                  <div className="messenger-reactions-strip">
                    {QUICK_REACTIONS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        className="reaction-chip"
                        onClick={() => handleAddReaction(emoji)}
                        title={`Add ${emoji}`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>

                  {/* Composer */}
                  <form className="messenger-composer" onSubmit={handleSend}>
                    <input
                      ref={inputRef}
                      type="text"
                      className="messenger-input"
                      placeholder={`Message ${activeChannel?.name || 'team'}…`}
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      onKeyDown={handleKeyDown}
                      disabled={sendingMessage}
                    />
                    <button
                      type="submit"
                      className="messenger-send-btn"
                      disabled={!inputText.trim() || sendingMessage}
                      title="Send Message"
                    >
                      <FaPaperPlane />
                    </button>
                  </form>
                </div>
              ) : (
                /* List View (Tabs: Channels vs Directory) */
                <div className="messenger-list-view">
                  <div className="messenger-tabs">
                    <button
                      type="button"
                      className={`messenger-tab${activeTab === 'chats' ? ' active' : ''}`}
                      onClick={() => setActiveTab('chats')}
                    >
                      <FaComments /> Departments & Chats
                      {unreadTotal > 0 && <span className="tab-badge">{unreadTotal}</span>}
                    </button>
                    <button
                      type="button"
                      className={`messenger-tab${activeTab === 'directory' ? ' active' : ''}`}
                      onClick={() => setActiveTab('directory')}
                    >
                      <FaUsers /> Team Directory
                    </button>
                  </div>

                  <div className="messenger-search-box">
                    <input
                      type="text"
                      className="messenger-search-input"
                      placeholder={
                        activeTab === 'chats'
                          ? 'Search department channels…'
                          : 'Search staff by name or role…'
                      }
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>

                  {activeTab === 'chats' ? (
                    <div>
                      <div className="channel-section-title">Department Channels</div>
                      {filteredChannels
                        .filter((c) => c.type === 'department')
                        .map((chan) => {
                          const meta = getDeptMeta(chan.department, 'department');
                          const Icon = meta.icon;
                          const hasUnread = (chan.unread_count || 0) > 0;

                          return (
                            <button
                              key={chan.id}
                              type="button"
                              className="channel-list-item"
                              onClick={() => handleOpenChannel(chan.id)}
                            >
                              <div className={`channel-icon-wrap ${meta.className}`}>
                                <Icon />
                              </div>
                              <div className="channel-meta">
                                <div className="channel-row-top">
                                  <span className="channel-row-name">{chan.name}</span>
                                  {chan.last_message && (
                                    <span className="channel-row-time">
                                      {formatMessageTime(chan.last_message.created_at)}
                                    </span>
                                  )}
                                </div>
                                <div className="channel-row-preview">
                                  {chan.last_message
                                    ? `${chan.last_message.user?.full_name?.split(' ')[0] || 'User'}: ${chan.last_message.message}`
                                    : chan.description || 'Live department room'}
                                </div>
                              </div>
                              {hasUnread && (
                                <span className="channel-unread-pill">{chan.unread_count}</span>
                              )}
                            </button>
                          );
                        })}

                      {/* Direct Messages Section */}
                      {filteredChannels.some((c) => c.type === 'direct') && (
                        <>
                          <div className="channel-section-title" style={{ marginTop: '12px' }}>
                            Direct Messages
                          </div>
                          {filteredChannels
                            .filter((c) => c.type === 'direct')
                            .map((chan) => (
                              <button
                                key={chan.id}
                                type="button"
                                className="channel-list-item"
                                onClick={() => handleOpenChannel(chan.id)}
                              >
                                <div className={`messenger-avatar ${chan.is_online ? 'online' : ''}`}>
                                  {getInitials(chan.name)}
                                </div>
                                <div className="channel-meta">
                                  <div className="channel-row-top">
                                    <span className="channel-row-name">{chan.name}</span>
                                    {chan.last_message && (
                                      <span className="channel-row-time">
                                        {formatMessageTime(chan.last_message.created_at)}
                                      </span>
                                    )}
                                  </div>
                                  <div className="channel-row-preview">
                                    {chan.last_message ? chan.last_message.message : 'Direct conversation'}
                                  </div>
                                </div>
                                {chan.unread_count > 0 && (
                                  <span className="channel-unread-pill">{chan.unread_count}</span>
                                )}
                              </button>
                            ))}
                        </>
                      )}
                    </div>
                  ) : (
                    /* Directory Tab */
                    <div>
                      <div className="channel-section-title">All Team Members</div>
                      {filteredDirectory.map((colleague) => (
                        <div key={colleague.id} className="user-dir-item">
                          <div className="user-dir-info">
                            <div className={`messenger-avatar ${colleague.is_online ? 'online' : ''}`}>
                              {getInitials(colleague.full_name)}
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div className="user-dir-name">{colleague.full_name}</div>
                              <div className="user-dir-role">
                                {colleague.role_label || colleague.department}
                                {colleague.is_online && (
                                  <span style={{ color: '#22c55e', marginLeft: '6px' }}>• Active</span>
                                )}
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            className="chat-btn-action"
                            onClick={() => handleStartDirect(colleague.id)}
                          >
                            Message
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </aside>
      )}
    </>
  );
}
