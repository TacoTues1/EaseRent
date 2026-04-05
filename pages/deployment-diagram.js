import Head from 'next/head'
import Link from 'next/link'

function GroupBox({ x, y, w, h, title, children }) {
    return (
        <g>
            <rect x={x} y={y} width={w} height={h} fill="white" stroke="#4b5563" strokeWidth="1.4" />
            <text x={x + w / 2} y={y + 24} textAnchor="middle" fontSize="13" fontWeight="600" fill="#111827">
                {title}
            </text>
            {children}
        </g>
    )
}

export default function DeploymentDiagramPage() {
    return (
        <>
            <Head>
                <title>Deployment Diagram - Abalay</title>
                <meta name="description" content="Deployment diagram for the Abalay rental platform." />
            </Head>

            <div className="min-h-screen bg-gray-100 pt-24 pb-10">
                <div className="max-w-6xl mx-auto px-4 sm:px-6">
                    <div className="flex items-center justify-center gap-4 text-sm text-gray-600 mb-4">
                        <Link href="/dashboard" className="hover:text-gray-900">Dashboard</Link>
                        <span>|</span>
                        <Link href="/flowchart" className="hover:text-gray-900">Flowchart</Link>
                        <span>|</span>
                        <Link href="/gantt" className="hover:text-gray-900">Gantt</Link>
                    </div>

                    <div className="bg-white border border-gray-300 shadow-sm p-4 sm:p-6 overflow-x-auto">
                        <svg viewBox="0 0 1120 820" className="min-w-[1120px] w-full h-auto" role="img" aria-label="Deployment Diagram">
                            <defs>
                                <marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
                                    <path d="M0,0 L10,3 L0,6 z" fill="#111827" />
                                </marker>
                            </defs>

                            <g stroke="#111827" strokeWidth="1.4" fill="none" markerEnd="url(#arrow)">
                                <path d="M320 130 L390 130 L390 220" />
                                <path d="M245 390 L245 450 L470 450" />
                                <path d="M550 515 L550 610" />
                                <path d="M650 390 L740 390" strokeDasharray="7 5" />
                                <path d="M560 375 L850 130" />
                                <path d="M560 390 L740 390" />
                                <path d="M260 450 L260 390" />
                                <path d="M985 450 L985 510" strokeDasharray="7 5" />
                                <path d="M865 635 L665 635" strokeDasharray="7 5" />
                            </g>

                            <rect x="575" y="364" width="10" height="10" fill="#dc2626" stroke="#111827" strokeWidth="0.8" />
                            <rect x="587" y="364" width="10" height="10" fill="#dc2626" stroke="#111827" strokeWidth="0.8" />
                            <rect x="581" y="375" width="10" height="10" fill="#dc2626" stroke="#111827" strokeWidth="0.8" />
                            <text x="615" y="386" fontSize="22" fill="#111827" fontWeight="600">Firewall</text>

                            <path
                                d="M444 425 C438 392 470 370 500 380 C510 347 560 345 578 380 C613 368 646 398 634 430 C660 441 660 483 629 491 L470 491 C438 491 420 451 444 425"
                                fill="white"
                                stroke="#111827"
                                strokeWidth="1.4"
                            />
                            <text x="530" y="448" textAnchor="middle" fontSize="20" fill="#111827" fontWeight="700">Cloud</text>
                            <text x="300" y="445" fontSize="18" fill="#111827">API (request)</text>
                            <text x="560" y="330" fontSize="18" fill="#111827">response</text>
                            <text x="578" y="536" fontSize="18" fill="#111827">API (response)</text>

                            <GroupBox x={65} y={30} w={250} h={140} title="Web Browser">
                                <rect x={88} y={82} width={134} height={60} fill="white" stroke="#4b5563" strokeWidth="1.2" />
                                <text x={155} y={118} textAnchor="middle" fontSize="32" fill="#111827">HTML</text>
                            </GroupBox>

                            <GroupBox x={85} y={200} w={350} h={175} title="Client">
                                <rect x={130} y={243} width={86} height={65} fill="white" stroke="#4b5563" strokeWidth="1.2" />
                                <rect x={307} y={238} width={96} height={72} fill="white" stroke="#4b5563" strokeWidth="1.2" rx="4" />
                                <text x={173} y={342} textAnchor="middle" fontSize="15" fill="#111827">Desktop Device</text>
                                <text x={355} y={342} textAnchor="middle" fontSize="15" fill="#111827">Laptop Device</text>
                            </GroupBox>

                            <GroupBox x={85} y={485} w={260} h={235} title="Mobile application">
                                <rect x={112} y={535} width={208} height={50} fill="white" stroke="#4b5563" strokeWidth="1.1" />
                                <text x={216} y={566} textAnchor="middle" fontSize="16" fill="#111827">Config/API File</text>
                                <rect x={112} y={596} width={208} height={50} fill="white" stroke="#4b5563" strokeWidth="1.1" />
                                <text x={216} y={627} textAnchor="middle" fontSize="16" fill="#111827">Resources</text>
                                <rect x={112} y={658} width={208} height={50} fill="white" stroke="#4b5563" strokeWidth="1.1" />
                                <text x={216} y={689} textAnchor="middle" fontSize="16" fill="#111827">AccountData.xml</text>
                            </GroupBox>

                            <GroupBox x={430} y={580} w={235} h={170} title="Mobile Device">
                                <rect x={455} y={626} width={185} height={45} fill="white" stroke="#4b5563" strokeWidth="1.2" />
                                <rect x={455} y={682} width={185} height={45} fill="white" stroke="#4b5563" strokeWidth="1.2" />
                                <text x={548} y={654} textAnchor="middle" fontSize="18" fill="#111827">Mobile Device</text>
                                <text x={548} y={711} textAnchor="middle" fontSize="18" fill="#111827">Tablet Device</text>
                            </GroupBox>

                            <GroupBox x={860} y={45} w={250} h={150} title="Web Server">
                                <rect x={903} y={98} width={165} height={74} fill="white" stroke="#4b5563" strokeWidth="1.2" />
                                <text x={986} y={141} textAnchor="middle" fontSize="30" fill="#111827">Index.php</text>
                            </GroupBox>

                            <GroupBox x={860} y={300} w={250} h={150} title="Apisiat Server">
                                <rect x={902} y={352} width={166} height={72} fill="white" stroke="#4b5563" strokeWidth="1.2" />
                                <text x={985} y={395} textAnchor="middle" fontSize="28" fill="#111827">Web Server</text>
                            </GroupBox>

                            <GroupBox x={840} y={500} w={280} h={265} title="Application Server">
                                <rect x={878} y={551} width={205} height={44} fill="white" stroke="#4b5563" strokeWidth="1.2" />
                                <text x={981} y={579} textAnchor="middle" fontSize="16" fill="#111827">U/Server/Server</text>
                                <rect x={878} y={607} width={205} height={44} fill="white" stroke="#4b5563" strokeWidth="1.2" />
                                <text x={981} y={635} textAnchor="middle" fontSize="16" fill="#111827">API Endpoints</text>
                                <rect x={878} y={663} width={205} height={44} fill="white" stroke="#4b5563" strokeWidth="1.2" />
                                <text x={981} y={691} textAnchor="middle" fontSize="16" fill="#111827">Libraries/Dependencies</text>
                                <rect x={878} y={719} width={205} height={44} fill="white" stroke="#4b5563" strokeWidth="1.2" />
                                <text x={981} y={747} textAnchor="middle" fontSize="16" fill="#111827">PHP Framework</text>
                            </GroupBox>

                            <circle cx="253" cy="758" r="16" fill="white" stroke="#4b5563" strokeWidth="1.2" />
                            <path d="M253 775 C228 775 220 795 220 806 L286 806 C286 795 278 775 253 775z" fill="white" stroke="#4b5563" strokeWidth="1.2" />
                            <text x="252" y="818" textAnchor="middle" fontSize="17" fill="#111827">Customer</text>

                            <rect x="553" y="760" width="35" height="58" rx="6" fill="white" stroke="#4b5563" strokeWidth="1.2" />
                            <rect x="600" y="752" width="48" height="66" rx="6" fill="white" stroke="#4b5563" strokeWidth="1.2" />
                            <text x="602" y="818" textAnchor="middle" fontSize="17" fill="#111827">Mobile Device</text>
                        </svg>
                    </div>

                    <div className="bg-white border border-t-0 border-gray-300 py-4 text-center">
                        <p className="text-3xl text-gray-900 font-serif">
                            <span className="font-semibold">Figure 49.</span> Deployment Diagram
                        </p>
                    </div>
                </div>
            </div>
        </>
    )
}
